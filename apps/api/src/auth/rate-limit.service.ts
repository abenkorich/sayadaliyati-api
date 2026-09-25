import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { API_CONFIG } from '../config.js';
import type { ApiConfig } from '../config.js';
import { TokensService } from './tokens.service.js';
import { ApiError } from './errors.js';

const increment = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n`;

@Injectable()
export class RateLimitService implements OnApplicationShutdown {
  private readonly redis: Redis;
  constructor(
    @Inject(API_CONFIG) config: ApiConfig,
    @Inject(TokensService) private readonly tokens: TokensService,
  ) {
    this.redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    });
    this.redis.on('error', () => {
      /* callers return safe 503s, never connection details */
    });
  }

  async check(
    scope: string,
    identity: string,
    limit: number,
    windowMs: number,
  ): Promise<void> {
    let count: unknown;
    try {
      count = await this.redis.eval(
        increment,
        1,
        `saydaliyati:auth:${scope}:${this.tokens.rateDigest(identity)}`,
        windowMs,
      );
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
    if (typeof count !== 'number') throw new ApiError('SERVICE_UNAVAILABLE');
    if (count > limit) throw new ApiError('RATE_LIMITED');
  }
  async isReady(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
