import { Inject, Injectable } from '@nestjs/common';
import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { API_CONFIG } from '../config.js';
import type { ApiConfig } from '../config.js';
import { ApiError } from './errors.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${UUID}$`);
const refreshPattern = new RegExp(
  `^(${UUID})\\.([A-Za-z0-9_-]{43})\\.([A-Za-z0-9_-]{43})$`,
);
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const issuer = 'saydaliyati-api';
const audience = 'saydaliyati-mobile';

@Injectable()
export class TokensService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;
  private readonly rateKey: Uint8Array;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    const derive = (purpose: string) =>
      new Uint8Array(
        hkdfSync(
          'sha256',
          Buffer.from(config.AUTH_SECRET, 'hex'),
          'saydaliyati-auth-v1',
          purpose,
          32,
        ),
      );
    this.accessKey = derive('access');
    this.refreshKey = derive('refresh');
    this.rateKey = derive('rate-limit');
  }

  async access(
    userId: string,
    sessionId: string,
    sessionExpiry: Date,
  ): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(
        Math.min(
          Math.floor(Date.now() / 1000) + 600,
          Math.floor(sessionExpiry.getTime() / 1000),
        ),
      )
      .sign(this.accessKey);
  }

  async verifyAccess(
    token: string,
  ): Promise<{ userId: string; sessionId: string }> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        algorithms: ['HS256'],
        issuer,
        audience,
        typ: 'at+jwt',
        requiredClaims: ['sub', 'sid', 'iat', 'exp', 'jti'],
      });
      if (
        typeof payload.sub !== 'string' ||
        !uuidPattern.test(payload.sub) ||
        typeof payload.sid !== 'string' ||
        !uuidPattern.test(payload.sid)
      )
        throw new Error('Invalid claims');
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    }
  }

  refresh(sessionId: string): string {
    const body = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    return `${body}.${createHmac('sha256', this.refreshKey).update(body).digest('base64url')}`;
  }

  verifyRefresh(token: string): string {
    const match = refreshPattern.exec(token);
    if (!match) throw new ApiError('AUTH_INVALID_CREDENTIALS');
    const [, sid, nonce, signature] = match;
    const expected = createHmac('sha256', this.refreshKey)
      .update(`${sid}.${nonce}`)
      .digest();
    const supplied = Buffer.from(signature!, 'base64url');
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected) ||
      supplied.toString('base64url') !== signature
    ) {
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    }
    return sid!;
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  matches(token: string, storedHash: string): boolean {
    const stored = Buffer.from(storedHash, 'hex');
    const expected = Buffer.from(this.hash(token), 'hex');
    return (
      stored.length === expected.length && timingSafeEqual(stored, expected)
    );
  }
  rateDigest(value: string): string {
    return createHmac('sha256', this.rateKey).update(value).digest('hex');
  }
}
