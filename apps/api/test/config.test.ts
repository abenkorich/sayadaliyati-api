import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config.js';

const security = {
  AUTH_SECRET: 'ab'.repeat(32),
  REDIS_URL: 'redis://127.0.0.1:1/1',
};

const validUrl = 'postgresql://test:local@127.0.0.1:55432/saydaliyati_test';

test('configuration has a local binding and parses the port', () => {
  const config = readConfig({
    ...security,
    DATABASE_URL: validUrl,
    PORT: '3100',
  });
  assert.equal(config.HOST, '127.0.0.1');
  assert.equal(config.PORT, 3100);
  assert.equal(config.NODE_ENV, 'development');
});

test('configuration rejects missing, invalid or out-of-range settings', () => {
  for (const env of [
    {},
    { DATABASE_URL: 'https://example.com/database' },
    { DATABASE_URL: 'postgresql://localhost' },
    { DATABASE_URL: validUrl, PORT: '0' },
    { DATABASE_URL: validUrl, PORT: '65536' },
    { DATABASE_URL: validUrl, PORT: 'not-a-port' },
    { DATABASE_URL: validUrl, NODE_ENV: 'typo' },
  ])
    assert.throws(
      () => readConfig({ ...security, ...env }),
      /Invalid environment configuration/,
    );
});

test('configuration errors never echo credentials', () => {
  assert.throws(
    () =>
      readConfig({
        ...security,
        DATABASE_URL: 'https://person:secret-password@example.com/db',
      }),
    {
      message: 'Invalid environment configuration: DATABASE_URL',
    },
  );
});
