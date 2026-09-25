import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingHttpHeaders } from 'node:http';
import { AuthService } from './auth.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { TokensService } from './tokens.service.js';
import { ApiError } from './errors.js';

export const Public = () => SetMetadata('auth:public', true);
export const AllowRevokedSession = () => SetMetadata('auth:logout', true);
export interface AuthContext {
  userId: string;
  sessionId: string;
  role: string;
}
export interface AuthRequest {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
  requestId: string;
  auth?: AuthContext;
}
export function actor(request: AuthRequest): AuthContext {
  if (!request.auth) throw new ApiError('AUTH_REQUIRED');
  return request.auth;
}
export function requestIp(request: AuthRequest): string {
  return request.socket.remoteAddress ?? 'unknown';
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('auth:public', targets))
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    await this.rates.check('protected-ip', requestIp(request), 120, 60000);
    const authorization = request.headers.authorization;
    if (!authorization) throw new ApiError('AUTH_REQUIRED');
    if (
      authorization.length > 2048 ||
      !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)
    )
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    const claims = await this.tokens.verifyAccess(authorization.slice(7));
    request.auth = await this.auth.authenticate(
      claims,
      this.reflector.getAllAndOverride<boolean>('auth:logout', targets) ===
        true,
    );
    return true;
  }
}
