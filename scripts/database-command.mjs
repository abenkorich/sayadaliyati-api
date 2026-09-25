import { spawnSync } from 'node:child_process';

const command = process.argv[2];
const allowed = new Map([
  ['migrate', ['migrate', 'deploy']],
  ['status', ['migrate', 'status']],
  ['grant', []],
  ['seed-catalog', []],
]);
const args = allowed.get(command ?? '');
if (!args || !process.env['MIGRATION_DATABASE_URL']) {
  throw new Error(
    'Use migrate, status, grant or seed-catalog with MIGRATION_DATABASE_URL configured.',
  );
}
const result = spawnSync(
  'pnpm',
  command === 'seed-catalog'
    ? ['--filter', '@saydaliyati/database', 'seed:catalog']
    : command === 'grant'
      ? ['--filter', '@saydaliyati/database', 'grant:local']
      : ['--filter', '@saydaliyati/database', 'exec', 'prisma', ...args],
  {
    stdio: 'inherit',
    env: process.env,
  },
);
process.exitCode = result.status ?? 1;
