import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';

test('HTTP readiness uses real PostgreSQL with the restricted application role', async () => {
  const connectionString = process.env['TEST_RUNTIME_DATABASE_URL'];
  assert.ok(connectionString);
  assert.equal(new URL(connectionString).pathname, '/saydaliyati_test');
  const app = await createApplication(
    readConfig({
      AUTH_SECRET: 'ab'.repeat(32),
      REDIS_URL: process.env['TEST_REDIS_URL'],
      NODE_ENV: 'test',
      DATABASE_URL: connectionString,
    }),
  );
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/api/v1/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: { status: 'ready' },
      meta: {},
    });
  } finally {
    await app.close();
  }
});

test('real connection failure returns 503 while liveness remains healthy', async () => {
  const app = await createApplication(
    readConfig({
      AUTH_SECRET: 'ab'.repeat(32),
      REDIS_URL: process.env['TEST_REDIS_URL'],
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unavailable',
    }),
  );
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const response = await fetch(`${base}/api/v1/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable.',
        details: {},
      },
    });
    const live = await fetch(`${base}/api/v1/health/live`);
    assert.equal(live.status, 200);
    await live.arrayBuffer();
  } finally {
    await app.close();
  }
});
