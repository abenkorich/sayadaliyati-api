import { createDatabaseClient } from '../dist/index.js';
import { seedCatalog } from './catalog-fixtures.mjs';

const connection = process.env['MIGRATION_DATABASE_URL'];
if (!connection || process.env['NODE_ENV'] === 'production')
  throw new Error(
    'Development catalog seed requires a local development database.',
  );
const url = new URL(connection);
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  !['/saydaliyati', '/saydaliyati_test'].includes(url.pathname)
) {
  throw new Error(
    'Synthetic catalog seed is restricted to local Saydaliyati development/test databases.',
  );
}
const client = createDatabaseClient(connection);
try {
  await seedCatalog(client);
  console.log(
    'Synthetic catalog fixtures ready (5 demo records; no real medicine data).',
  );
} finally {
  await client.$disconnect();
}
