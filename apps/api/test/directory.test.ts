import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DirectoryService,
  directoryKind,
  directoryQuery,
  directorySelect,
} from '../src/directory/directory.service.js';
import { DirectoryController } from '../src/directory/directory.controller.js';
import type { DatabaseService } from '../src/database.service.js';

test('directory kinds and query validation reject unpublished-status overrides and unbounded input', () => {
  for (const kind of ['hospitals', 'pharmacies', 'doctors'])
    assert.equal(directoryKind.safeParse(kind).success, true);
  assert.equal(directoryKind.safeParse('users').success, false);
  assert.deepEqual(directoryQuery.parse({}), {
    q: '',
    city: '',
    page: 1,
    limit: 20,
  });
  for (const input of [
    { status: 'DRAFT' },
    { page: 0 },
    { page: 10001 },
    { limit: 51 },
    { q: 'x'.repeat(101) },
    { city: ['a', 'b'] },
  ])
    assert.equal(directoryQuery.safeParse(input).success, false);
});
test('patient directories only query active records and project contact fields', async () => {
  for (const kind of ['hospitals', 'pharmacies', 'doctors'] as const) {
    let list: Record<string, unknown> | undefined,
      count: Record<string, unknown> | undefined;
    const rows = [{ id: 'one', name: 'Synthetic provider' }];
    const db = {
      client: {
        adminDirectoryEntry: {
          findMany: async (query: Record<string, unknown>) => {
            list = query;
            return rows;
          },
          count: async (query: Record<string, unknown>) => {
            count = query;
            return 21;
          },
        },
        $transaction: (operations: Promise<unknown>[]) =>
          Promise.all(operations),
      },
    };
    const service = new DirectoryService(db as unknown as DatabaseService);
    const result = await service.list(
      kind,
      directoryQuery.parse({ q: 'care_%', city: 'Alger', page: 2 }),
    );
    assert.equal(list?.skip, 20);
    assert.equal(list?.take, 20);
    assert.deepEqual(list?.select, directorySelect);
    assert.equal('licenseNumber' in directorySelect, false);
    assert.deepEqual(list?.where, count?.where);
    assert.deepEqual(list?.where, {
      kind,
      status: 'ACTIVE',
      city: { contains: 'Alger', mode: 'insensitive' },
      OR: ['name', 'specialty', 'address', 'city'].map((field) => ({
        [field]: { contains: 'care\\_\\%', mode: 'insensitive' },
      })),
    });
    assert.deepEqual(result.meta, {
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    });
    assert.deepEqual(result.data, rows);
  }
});
test('controller validates inputs before accessing the directory service', () => {
  const service = {
    list: () => {
      throw new Error('database must not be reached');
    },
  };
  const controller = new DirectoryController(
    service as unknown as DirectoryService,
  );
  assert.throws(
    () => controller.list('users', {}),
    (error: unknown) => (error as { code: string }).code === 'VALIDATION_ERROR',
  );
});
