import { spawnSync } from 'node:child_process';

const testUrl = process.env['TEST_DATABASE_URL'];
const runtimeUrl = process.env['TEST_RUNTIME_DATABASE_URL'];
for (const value of [testUrl, runtimeUrl]) {
  if (!value) throw new Error('Configure both test database URLs in .env.');
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/saydaliyati_test'
  ) {
    throw new Error(
      'Integration tests require a local database named saydaliyati_test.',
    );
  }
}
const env = { ...process.env, MIGRATION_DATABASE_URL: testUrl };
const redisUrl = process.env['TEST_REDIS_URL'];
if (!redisUrl) throw new Error('Configure TEST_REDIS_URL in .env.');
const parsedRedis = new URL(redisUrl);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(parsedRedis.hostname) ||
  parsedRedis.pathname !== '/1'
) {
  throw new Error('Integration tests require local Redis database 1.');
}
const storageEndpoint = process.env['DOCUMENT_STORAGE_ENDPOINT'];
if (
  !storageEndpoint ||
  !['localhost', '127.0.0.1', '[::1]'].includes(
    new URL(storageEndpoint).hostname,
  )
)
  throw new Error(
    'Document integration tests require local private storage. Run pnpm storage:up and pnpm storage:init.',
  );
const commands = [
  ['--filter', '@saydaliyati/api', 'storage:init'],
  ['--filter', '@saydaliyati/database', 'exec', 'prisma', 'migrate', 'deploy'],
  ['--filter', '@saydaliyati/database', 'grant:local'],
  ['--filter', '@saydaliyati/database', 'test:integration'],
  ['--filter', '@saydaliyati/api', 'test:integration'],
];
for (const args of commands) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
