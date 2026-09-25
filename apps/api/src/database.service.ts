import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { createDatabaseClient, isDatabaseReady } from '@saydaliyati/database';
import { API_CONFIG } from './config.js';
import type { ApiConfig } from './config.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = createDatabaseClient(config.DATABASE_URL);
  }

  async isReady(): Promise<boolean> {
    try {
      return await isDatabaseReady(this.client);
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
