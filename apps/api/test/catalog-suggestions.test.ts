import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/application.js';
import { readConfig } from '../src/config.js';
import { DatabaseService } from '../src/database.service.js';
import { CatalogRepository } from '../src/catalog/catalog.repository.js';
import { RateLimitService } from '../src/auth/rate-limit.service.js';
import { ApiError } from '../src/auth/errors.js';

test('public suggestions are bounded, validated and rate limited; full catalog stays authenticated', async () => {
  let input: Record<string, unknown> | undefined;
  let limited = false;
  const module = await Test.createTestingModule({
    imports: [
      AppModule.register(
        readConfig({
          AUTH_SECRET: 'ab'.repeat(32),
          REDIS_URL: 'redis://localhost:1',
          DATABASE_URL: 'postgres://unused:unused@localhost/unused',
        }),
      ),
    ],
  })
    .overrideProvider(DatabaseService)
    .useValue({ isReady: async () => true })
    .overrideProvider(CatalogRepository)
    .useValue({
      search: async (q: Record<string, unknown>) => {
        input = q;
        return {
          data: [
            {
              id: 'synthetic',
              name: 'Synthetic medicine',
              boxImageUrl: null,
              category: null,
            },
          ],
          meta: { total: 1 },
        };
      },
    })
    .overrideProvider(RateLimitService)
    .useValue({
      check: async () => {
        if (limited) throw new ApiError('RATE_LIMITED');
      },
    })
    .compile();
  const app = module.createNestApplication({ logger: false });
  await configureApplication(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    const response = await fetch(
      `${base}/api/v1/medicines/suggestions?q=%20ALPHA%20&category=uncategorized`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(input, {
      q: 'alpha',
      category: 'uncategorized',
      status: 'ACTIVE',
      page: 1,
      limit: 6,
    });
    const data = (await response.json()) as {
      data: { boxImageUrl: string | null }[];
    };
    assert.equal(data.data[0]?.boxImageUrl, null);
    for (const q of [
      '',
      '?q=a',
      '?q=alpha&limit=100',
      '?q=alpha&status=INACTIVE',
      '?q=alpha&category=invalid',
    ])
      assert.equal(
        (await fetch(`${base}/api/v1/medicines/suggestions${q}`)).status,
        400,
      );
    for (const path of ['', '/categories'])
      assert.equal(
        (await fetch(`${base}/api/v1/medicines${path}`)).status,
        401,
      );
    limited = true;
    assert.equal(
      (await fetch(`${base}/api/v1/medicines/suggestions?q=alpha`)).status,
      429,
    );
  } finally {
    await app.close();
  }
});
