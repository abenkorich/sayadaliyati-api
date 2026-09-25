import { readFileSync } from 'node:fs';
import pg from 'pg';

const connectionString = process.env['MIGRATION_DATABASE_URL'];
if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required.');
const url = new URL(connectionString);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  !['/saydaliyati', '/saydaliyati_test'].includes(url.pathname)
) {
  throw new Error('Local role grants require a local Saydaliyati database.');
}
const client = new pg.Client({ connectionString });
try {
  await client.connect();
  await client.query(
    readFileSync(
      new URL('../prisma/local-runtime-grants.sql', import.meta.url),
      'utf8',
    ),
  );
  console.log('Applied scoped local application privileges.');
} finally {
  await client.end();
}
