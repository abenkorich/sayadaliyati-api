import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation/validation need no credentials. Migration commands fail if absent.
  datasource: { url: process.env['MIGRATION_DATABASE_URL'] ?? '' },
});
