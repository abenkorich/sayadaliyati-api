import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { ApiError } from './errors.js';

const options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

@Injectable()
export class PasswordsService {
  private active = 0;
  private readonly dummy = argon2.hash(
    randomBytes(32).toString('hex'),
    options,
  );
  async onModuleInit(): Promise<void> {
    await this.dummy;
  }

  private async limited<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 4) throw new ApiError('RATE_LIMITED');
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
    }
  }
  hash(password: string): Promise<string> {
    return this.limited(() => argon2.hash(password, options));
  }
  verify(password: string, hash: string | null): Promise<boolean> {
    return this.limited(async () => {
      const target = hash ?? (await this.dummy);
      try {
        const matches = await argon2.verify(target, password);
        return hash !== null && matches;
      } catch {
        return false;
      }
    });
  }
}
