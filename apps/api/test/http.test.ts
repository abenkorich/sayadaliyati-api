import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/application.js';
import { readConfig } from '../src/config.js';
import { DatabaseService } from '../src/database.service.js';

import { Public } from '../src/auth/auth.guard.js';
import { RateLimitService } from '../src/auth/rate-limit.service.js';

// Test-only route: it is never registered in the production application.
@Public()
@Controller('test-error')
class ErrorController {
  @Get()
  fail() {
    throw new Error('postgresql://owner:secret@example/patient-data');
  }
}

let app: INestApplication;
let baseUrl: string;
let ready = true;
let probes = 0;

before(async () => {
  const module = await Test.createTestingModule({
    imports: [
      AppModule.register(
        readConfig({
          AUTH_SECRET: 'ab'.repeat(32),
          REDIS_URL: 'redis://127.0.0.1:1/1',
          DATABASE_URL: 'postgresql://unused:unused@localhost/unused',
        }),
      ),
    ],
    controllers: [ErrorController],
  })
    .overrideProvider(DatabaseService)
    .useValue({
      isReady: async () => {
        probes += 1;
        return ready;
      },
    })
    .overrideProvider(RateLimitService)
    .useValue({ isReady: async () => true, check: async () => {} })
    .compile();
  app = module.createNestApplication({ logger: false });
  await configureApplication(app);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

after(async () => {
  await app?.close();
});

test('liveness uses the versioned envelope without touching the database', async () => {
  const previousProbes = probes;
  const response = await fetch(`${baseUrl}/api/v1/health/live`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { status: 'ok' }, meta: {} });
  assert.equal(probes, previousProbes);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('x-request-id') ?? '', /^[\da-f-]{36}$/);
});

test('readiness responds to database availability and recovers', async () => {
  ready = false;
  const unavailable = await fetch(`${baseUrl}/api/v1/health/ready`);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable.',
      details: {},
    },
  });
  const live = await fetch(`${baseUrl}/api/v1/health/live`);
  assert.equal(live.status, 200);
  ready = true;
  const available = await fetch(`${baseUrl}/api/v1/health/ready`);
  assert.equal(available.status, 200);
  assert.deepEqual(await available.json(), {
    data: { status: 'ready' },
    meta: {},
  });
});

test('unimplemented product routes and unversioned routes are not exposed', async () => {
  for (const path of [
    '/health/live',
    '/api/v1/me/shares/active',
    '/api/v1/auth/register',
    '/api/v1/users',
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Resource not found.',
        details: {},
      },
    });
  }
});

test('unexpected exceptions expose neither credentials nor implementation details', async () => {
  const response = await fetch(`${baseUrl}/api/v1/test-error`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'PROCESSING_FAILED',
      message: 'Request could not be processed.',
      details: {},
    },
  });
});

test('request correlation IDs are server-generated and distinct', async () => {
  const first = await fetch(`${baseUrl}/api/v1/health/live`, {
    headers: { 'x-request-id': 'untrusted-input' },
  });
  const second = await fetch(`${baseUrl}/api/v1/health/live`);
  assert.notEqual(first.headers.get('x-request-id'), 'untrusted-input');
  assert.notEqual(
    first.headers.get('x-request-id'),
    second.headers.get('x-request-id'),
  );
  await first.arrayBuffer();
  await second.arrayBuffer();
});

test('healthcare directories require authentication', async () => {
  for (const kind of ['hospitals', 'pharmacies', 'doctors']) {
    const response = await fetch(`${baseUrl}/api/v1/directory/${kind}`);
    assert.equal(response.status, 401);
    await response.arrayBuffer();
  }
});
