import { validateDirectoryLocation } from '../geography/geo.service.js';
import { normalizeCatalogText } from '@saydaliyati/validation';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import type { z } from 'zod';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import type {
  listSchema,
  medicineSchema,
  directorySchema,
  directoryKindSchema,
  settingsSchema,
  userPatchSchema,
} from './admin.schemas.js';
const userSelect = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
} as const;
const medicineSelect = {
  id: true,
  name: true,
  genericName: true,
  strength: true,
  dosageForm: true,
  status: true,
  source: true,
} as const;
type List = z.infer<typeof listSchema>;
type Kind = z.infer<typeof directoryKindSchema>;
export function requireAdmin(actor: AuthContext) {
  if (actor.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
}
@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async write<T>(
    actor: AuthContext,
    action: string,
    requestId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    resourceId?: string,
  ) {
    requireAdmin(actor);
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizeOwnerMutation(tx, actor);
      const user = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { role: true },
      });
      if (user?.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
      const data = await operation(tx);
      await tx.auditLog.createMany({
        data: [
          {
            actorId: actor.userId,
            action,
            resourceType: 'ADMINISTRATION',
            resourceId:
              resourceId ??
              (data && typeof data === 'object' && 'id' in data
                ? /^[0-9a-f-]{36}$/i.test(String(data.id))
                  ? String(data.id)
                  : null
                : null),
            metadata: { requestId, result: 'SUCCESS' },
          },
        ],
      });
      return { data, meta: {} };
    });
  }
  async overview(actor: AuthContext) {
    requireAdmin(actor);
    const [users, medicines, doctors, pharmacies, hospitals] =
      await Promise.all([
        this.db.client.user.count(),
        this.db.client.medicine.count(),
        ...(['doctors', 'pharmacies', 'hospitals'] as const).map((kind) =>
          this.db.client.adminDirectoryEntry.count({
            where: { kind, status: { not: 'ARCHIVED' } },
          }),
        ),
      ]);
    return {
      data: {
        users,
        medicines,
        doctors,
        pharmacies,
        hospitals,
        subscriptions: 'PLANNED',
      },
      meta: {},
    };
  }
  private meta(total: number, page: number) {
    return { total, page, pageSize: 20, totalPages: Math.ceil(total / 20) };
  }
  async users(actor: AuthContext, { q, page }: List) {
    requireAdmin(actor);
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }
      : {};
    const [data, total] = await this.db.client.$transaction([
      this.db.client.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.db.client.user.count({ where }),
    ]);
    return { data, meta: this.meta(total, page) };
  }
  userStatus(
    actor: AuthContext,
    id: string,
    input: z.infer<typeof userPatchSchema>,
    requestId: string,
  ) {
    return this.write(
      actor,
      'ADMIN_USER_STATUS_CHANGED',
      requestId,
      async (tx) => {
        // Admin accounts cannot be disabled here: avoids self-lockout and last-admin races.
        const target = await tx.user.findUnique({
          where: { id },
          select: userSelect,
        });
        if (!target) throw new ApiError('RESOURCE_NOT_FOUND');
        if (target.role === 'ADMIN') throw new ApiError('FORBIDDEN');
        const changed = await tx.user.updateMany({
          where: { id, role: { not: 'ADMIN' } },
          data: { status: input.status },
        });
        if (!changed.count) throw new ApiError('FORBIDDEN');
        if (input.status !== 'ACTIVE')
          await tx.session.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        return { ...target, status: input.status };
      },
      id,
    );
  }
  async medicines(actor: AuthContext, { q, page }: List) {
    requireAdmin(actor);
    const where: Prisma.MedicineWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { genericName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [data, total] = await this.db.client.$transaction([
      this.db.client.medicine.findMany({
        where,
        select: medicineSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.db.client.medicine.count({ where }),
    ]);
    return { data, meta: this.meta(total, page) };
  }
  saveMedicine(
    actor: AuthContext,
    id: string | undefined,
    input: z.infer<typeof medicineSchema>,
    requestId: string,
  ) {
    return this.write(
      actor,
      id ? 'ADMIN_MEDICINE_UPDATED' : 'ADMIN_MEDICINE_CREATED',
      requestId,
      async (tx) => {
        const data = {
          ...input,
          normalizedName: normalizeCatalogText(input.name),
        };
        if (id) {
          if (
            !(await tx.medicine.findUnique({
              where: { id },
              select: { id: true },
            }))
          )
            throw new ApiError('RESOURCE_NOT_FOUND');
          return tx.medicine.update({
            where: { id },
            data,
            select: medicineSelect,
          });
        }
        const created = await tx.$queryRaw<
          { id: string }[]
        >`INSERT INTO medicines (name, normalized_name, generic_name, strength, dosage_form, status, source) VALUES (${data.name}, ${data.normalizedName}, ${data.genericName}, ${data.strength}, ${data.dosageForm}, ${data.status}::medicine_status, ${data.source}) RETURNING id`;
        return tx.medicine.findUniqueOrThrow({
          where: { id: created[0]!.id },
          select: medicineSelect,
        });
      },
      id,
    );
  }
  async directory(actor: AuthContext, kind: Kind, { q, page }: List) {
    requireAdmin(actor);
    const where: Prisma.AdminDirectoryEntryWhereInput = {
      kind,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.db.client.$transaction([
      this.db.client.adminDirectoryEntry.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.db.client.adminDirectoryEntry.count({ where }),
    ]);
    return { data, meta: this.meta(total, page) };
  }
  saveDirectory(
    actor: AuthContext,
    kind: Kind,
    id: string | undefined,
    input: z.infer<typeof directorySchema>,
    requestId: string,
  ) {
    return this.write(
      actor,
      id ? 'ADMIN_DIRECTORY_UPDATED' : 'ADMIN_DIRECTORY_CREATED',
      requestId,
      async (tx) => {
        const previous = id
          ? await tx.adminDirectoryEntry.findUnique({ where: { id } })
          : null;
        const { countryId, wilayaId, communeId, ...fields } = input;
        const data = {
          ...fields,
          ...(countryId !== undefined ? { countryId } : {}),
          ...(wilayaId !== undefined ? { wilayaId } : {}),
          ...(communeId !== undefined ? { communeId } : {}),
        };
        await validateDirectoryLocation(tx, { ...previous, ...data });
        if (id) {
          if (
            !(await tx.adminDirectoryEntry.findFirst({
              where: { id, kind },
              select: { id: true },
            }))
          )
            throw new ApiError('RESOURCE_NOT_FOUND');
          return tx.adminDirectoryEntry.update({ where: { id }, data });
        }
        return tx.adminDirectoryEntry.create({ data: { ...data, kind } });
      },
      id,
    );
  }
  async settings(actor: AuthContext) {
    requireAdmin(actor);
    const data = await this.db.client.adminSettings.findUnique({
      where: { id: 'platform' },
    });
    return {
      data: data ?? {
        organizationName: 'Saydaliyati',
        supportEmail: null,
        defaultLanguage: 'EN',
        timezone: 'Africa/Algiers',
      },
      meta: {},
    };
  }
  saveSettings(
    actor: AuthContext,
    input: z.infer<typeof settingsSchema>,
    requestId: string,
  ) {
    return this.write(actor, 'ADMIN_SETTINGS_UPDATED', requestId, (tx) =>
      tx.adminSettings.upsert({
        where: { id: 'platform' },
        create: { id: 'platform', ...input },
        update: input,
      }),
    );
  }
}
