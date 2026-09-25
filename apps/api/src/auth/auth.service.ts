import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@saydaliyati/database';
import type {
  LoginInput,
  ProfilePatchInput,
  RegistrationInput,
} from '@saydaliyati/validation';
import { DatabaseService } from '../database.service.js';
import { PasswordsService } from './passwords.service.js';
import { SESSION_LIFETIME_MS, TokensService } from './tokens.service.js';
import { ApiError } from './errors.js';
import type { AuthContext } from './auth.guard.js';

const userSelection = { id: true, role: true, status: true } as const;
type SessionRecord = Prisma.SessionGetPayload<{
  include: { user: { select: typeof userSelection } };
}>;
const profileSelection = {
  email: true,
  phone: true,
  patientProfile: {
    select: {
      firstName: true,
      lastName: true,
      preferredLanguage: true,
      timezone: true,
    },
  },
} as const;

function accountStatus(status: string): void {
  if (status === 'DISABLED') throw new ApiError('AUTH_ACCOUNT_DISABLED');
  if (status === 'SUSPENDED') throw new ApiError('AUTH_ACCOUNT_SUSPENDED');
  if (status !== 'ACTIVE') throw new ApiError('FORBIDDEN');
}
function activeSession(
  session: SessionRecord | null,
  allowRevoked = false,
): asserts session is SessionRecord {
  if (!session) throw new ApiError('AUTH_INVALID_CREDENTIALS');
  if (session.revokedAt && !allowRevoked)
    throw new ApiError('AUTH_SESSION_REVOKED');
  if (session.expiresAt.getTime() <= Date.now())
    throw new ApiError('AUTH_SESSION_EXPIRED');
  accountStatus(session.user.status);
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PasswordsService) private readonly passwords: PasswordsService,
    @Inject(TokensService) private readonly tokens: TokensService,
  ) {}

  private async audit(
    tx: Prisma.TransactionClient,
    action: string,
    actorId: string | null,
    resourceId: string | null,
    requestId: string,
    resourceType = 'SESSION',
  ): Promise<void> {
    await tx.auditLog.createMany({
      data: [
        {
          actorId,
          action,
          resourceType,
          resourceId,
          metadata: {
            requestId,
            result: action === 'AUTH_LOGIN_FAILED' ? 'DENIED' : 'SUCCESS',
          },
        },
      ],
    });
  }

  private async createSession(
    tx: Prisma.TransactionClient,
    user: { id: string; role: string },
    requestId: string,
  ) {
    const id = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
    const refreshToken = this.tokens.refresh(id);
    await tx.session.create({
      data: {
        id,
        userId: user.id,
        refreshTokenHash: this.tokens.hash(refreshToken),
        createdAt,
        expiresAt,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: createdAt },
    });
    await this.audit(tx, 'SESSION_CREATED', user.id, id, requestId);
    return {
      data: {
        user,
        accessToken: await this.tokens.access(user.id, id, expiresAt),
        refreshToken,
      },
      meta: {},
    };
  }

  async register(input: RegistrationInput, requestId: string) {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.db.client.$transaction(async (tx) => {
        // Explicit columns keep role/status at database defaults and allow a
        // runtime grant that cannot insert either privilege-bearing column.
        const users = await tx.$queryRaw<Array<{ id: string; role: string }>>`
          INSERT INTO users (email, phone, password_hash)
          VALUES (${input.email ?? null}, ${input.phone ?? null}, ${passwordHash})
          ON CONFLICT DO NOTHING
          RETURNING id, role
        `;
        const user = users[0];
        if (!user) throw new ApiError('VALIDATION_ERROR');
        await tx.patientProfile.create({
          data: {
            userId: user.id,
            firstName: input.firstName,
            lastName: input.lastName,
            preferredLanguage: input.preferredLanguage,
            timezone: input.timezone,
          },
        });
        return this.createSession(tx, user, requestId);
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new ApiError('VALIDATION_ERROR');
      if (
        error &&
        typeof error === 'object' &&
        'meta' in error &&
        error.meta &&
        typeof error.meta === 'object' &&
        'code' in error.meta &&
        error.meta.code === '23505'
      )
        throw new ApiError('VALIDATION_ERROR');
      throw error;
    }
  }

  async login(input: LoginInput, requestId: string) {
    const user = await this.db.client.user.findUnique({
      where: input.identifier.includes('@')
        ? { email: input.identifier }
        : { phone: input.identifier },
      select: { ...userSelection, passwordHash: true },
    });
    if (
      !(await this.passwords.verify(
        input.password,
        user?.passwordHash ?? null,
      )) ||
      !user
    ) {
      await this.audit(
        this.db.client,
        'AUTH_LOGIN_FAILED',
        null,
        null,
        requestId,
        'AUTH',
      );
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    }
    return this.db.client.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { ...userSelection, passwordHash: true },
      });
      if (!current || current.passwordHash !== user.passwordHash)
        throw new ApiError('AUTH_INVALID_CREDENTIALS');
      accountStatus(current.status);
      return this.createSession(
        tx,
        { id: current.id, role: current.role },
        requestId,
      );
    });
  }

  private async lockedSession(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<SessionRecord | null> {
    await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.session.findUnique({
      where: { id },
      include: { user: { select: userSelection } },
    });
  }

  async refresh(refreshToken: string, requestId: string) {
    const id = this.tokens.verifyRefresh(refreshToken);
    const result = await this.db.client.$transaction(async (tx) => {
      const session = await this.lockedSession(tx, id);
      activeSession(session);
      if (!this.tokens.matches(refreshToken, session.refreshTokenHash)) {
        await tx.session.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
        await this.audit(
          tx,
          'SESSION_REUSE_DETECTED',
          session.userId,
          id,
          requestId,
        );
        // Commit revocation before returning an authentication error.
        return { replayed: true } as const;
      }
      const replacement = this.tokens.refresh(id);
      await tx.session.update({
        where: { id },
        data: {
          refreshTokenHash: this.tokens.hash(replacement),
          lastUsedAt: new Date(),
        },
      });
      await this.audit(tx, 'SESSION_ROTATED', session.userId, id, requestId);
      return {
        replayed: false as const,
        data: {
          accessToken: await this.tokens.access(
            session.userId,
            id,
            session.expiresAt,
          ),
          refreshToken: replacement,
        },
        meta: {},
      };
    });
    if (result.replayed) throw new ApiError('AUTH_SESSION_REVOKED');
    return { data: result.data, meta: result.meta };
  }

  async authenticate(
    claims: { userId: string; sessionId: string },
    allowRevoked = false,
  ): Promise<AuthContext> {
    const session = await this.db.client.session.findUnique({
      where: { id: claims.sessionId },
      include: { user: { select: userSelection } },
    });
    if (!session || session.userId !== claims.userId)
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    activeSession(session, allowRevoked);
    return {
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
    };
  }

  async logout(actor: AuthContext, requestId: string) {
    await this.db.client.$transaction(async (tx) => {
      const session = await this.lockedSession(tx, actor.sessionId);
      activeSession(session, true);
      if (session.userId !== actor.userId)
        throw new ApiError('AUTH_INVALID_CREDENTIALS');
      if (!session.revokedAt) {
        await tx.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        await this.audit(
          tx,
          'SESSION_REVOKED',
          actor.userId,
          session.id,
          requestId,
        );
      }
    });
    return { data: {}, meta: {} };
  }

  async profile(actor: AuthContext) {
    if (actor.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
    const user = await this.db.client.user.findUnique({
      where: { id: actor.userId },
      select: profileSelection,
    });
    if (!user?.patientProfile) throw new ApiError('SERVICE_UNAVAILABLE');
    return {
      data: { ...user.patientProfile, email: user.email, phone: user.phone },
      meta: {},
    };
  }

  async authorizeOwnerMutation(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
  ): Promise<void> {
    const session = await this.lockedSession(tx, actor.sessionId);
    activeSession(session);
    if (session.userId !== actor.userId)
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    // A user row exists before preferences do: this also serializes first saves
    // across different sessions and rechecks status after waiting for the lock.
    const users = await tx.$queryRaw<
      { status: string }[]
    >`SELECT status FROM users WHERE id = ${actor.userId}::uuid FOR UPDATE`;
    if (!users[0]) throw new ApiError('AUTH_INVALID_CREDENTIALS');
    accountStatus(users[0].status);
  }

  async authorizePatientMutation(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
  ): Promise<void> {
    const session = await this.lockedSession(tx, actor.sessionId);
    activeSession(session);
    if (session.userId !== actor.userId || session.user.role !== 'PATIENT')
      throw new ApiError('FORBIDDEN');
  }

  async updateProfile(
    actor: AuthContext,
    input: ProfilePatchInput,
    requestId: string,
  ) {
    return this.db.client.$transaction(async (tx) => {
      const session = await this.lockedSession(tx, actor.sessionId);
      activeSession(session);
      if (session.userId !== actor.userId || session.user.role !== 'PATIENT')
        throw new ApiError('FORBIDDEN');
      const profile = await tx.patientProfile.update({
        where: { userId: actor.userId },
        data: {
          ...(input.firstName !== undefined
            ? { firstName: input.firstName }
            : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.preferredLanguage !== undefined
            ? { preferredLanguage: input.preferredLanguage }
            : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
        select: profileSelection.patientProfile.select,
      });
      await this.audit(
        tx,
        'PROFILE_UPDATED',
        actor.userId,
        actor.userId,
        requestId,
        'PATIENT_PROFILE',
      );
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { email: true, phone: true },
      });
      return { data: { ...profile, ...user }, meta: {} };
    });
  }
}
