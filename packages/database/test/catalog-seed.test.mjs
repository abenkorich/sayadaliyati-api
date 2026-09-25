import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseClient } from '../dist/index.js';
import {
  catalogFixtures,
  seedCatalog,
  fixtureSource,
  manufacturerId,
  ingredientId,
} from '../scripts/catalog-fixtures.mjs';

const connection = process.env['TEST_DATABASE_URL'];
assert.ok(connection, 'Run through pnpm test:integration');
const url = new URL(connection);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
assert.equal(url.pathname, '/saydaliyati_test');
const client = createDatabaseClient(connection);
const rollback = new Error('ROLLBACK_TEST_FIXTURES');

test('development catalog seed is repeatable, clearly synthetic and leaves unrelated data unchanged', async () => {
  try {
    await assert.rejects(
      client.$transaction(async (tx) => {
        // Exercise the real seed in an enclosing rollback-only transaction.
        /** @type {import('../scripts/catalog-fixtures.mjs').CatalogSeedClient} */
        const seedClient = { $transaction: (callback) => callback(tx) };
        const unrelated = await tx.medicine.create({
          data: {
            name: 'Unrelated synthetic fixture',
            normalizedName: 'unrelated synthetic fixture',
          },
        });
        await seedCatalog(seedClient);
        const where = { id: { in: catalogFixtures.map((row) => row.id) } };
        const first = await tx.medicine.findMany({
          where,
          include: { barcodes: true, ingredients: true },
          orderBy: { id: 'asc' },
        });
        await seedCatalog(seedClient);
        const second = await tx.medicine.findMany({
          where,
          include: { barcodes: true, ingredients: true },
          orderBy: { id: 'asc' },
        });
        assert.deepEqual(second, first);
        assert.equal(first.length, 5);
        assert.ok(
          first.every(
            (row) => row.source === fixtureSource && row.strength === null,
          ),
        );
        assert.ok(
          first.every(
            (row) => row.barcodes.length === 1 && row.ingredients.length === 1,
          ),
        );
        assert.deepEqual(
          await tx.medicine.findUnique({ where: { id: unrelated.id } }),
          unrelated,
        );
        throw rollback;
      }),
      (error) => error === rollback,
    );
  } finally {
    await client.$disconnect();
  }
});
test('seed identity collision rolls back without overwriting an existing catalog record', async () => {
  const db = createDatabaseClient(connection);
  try {
    await assert.rejects(
      db.$transaction(async (tx) => {
        const ingredientCount = await tx.activeIngredient.count({
          where: { id: ingredientId },
        });
        // Any temporary collision setup is rolled back, even if demo rows exist.
        await tx.manufacturer.upsert({
          where: { id: manufacturerId },
          update: { name: 'Existing manufacturer' },
          create: {
            id: manufacturerId,
            name: 'Existing manufacturer',
            normalizedName: 'existing manufacturer',
          },
        });
        await assert.rejects(
          seedCatalog({ $transaction: (callback) => callback(tx) }),
          /collision/,
        );
        assert.equal(
          (
            await tx.manufacturer.findUniqueOrThrow({
              where: { id: manufacturerId },
            })
          ).name,
          'Existing manufacturer',
        );
        assert.equal(
          await tx.activeIngredient.count({ where: { id: ingredientId } }),
          ingredientCount,
        );
        throw rollback;
      }),
      (error) => error === rollback,
    );
  } finally {
    await db.$disconnect();
  }
});
