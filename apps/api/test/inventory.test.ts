import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calendarDateSchema,
  inventoryCreateSchema,
  inventoryPatchSchema,
  inventoryQuerySchema,
  inventoryQuantitySchema,
} from '@saydaliyati/validation';
const sample = {
  medicineId: 'e0000000-0000-4000-8000-000000000001',
  quantity: 30,
  unit: 'CAPSULE',
};
test('inventory quantities are finite, nonnegative numeric values within numeric(12,3)', () => {
  for (const value of [0, 0.001, 12.345, 999999999.999])
    assert.equal(inventoryQuantitySchema.safeParse(value).success, true);
  for (const value of [
    -1,
    0.0001,
    1e-7,
    1000000000,
    NaN,
    Infinity,
    '12.345',
    null,
  ])
    assert.equal(inventoryQuantitySchema.safeParse(value).success, false);
});
test('calendar dates reject invalid leap days, rollover, timestamps and year zero', () => {
  for (const value of ['2028-02-29', '2026-12-31', '0001-01-01', '9999-12-31'])
    assert.equal(calendarDateSchema.safeParse(value).success, true, value);
  for (const value of [
    '2026-02-29',
    '2026-02-30',
    '2026-04-31',
    '0000-01-01',
    '2026-13-01',
    '2026-01-00',
    '2026-9-01',
    '2026-09-24T00:00:00Z',
  ])
    assert.equal(calendarDateSchema.safeParse(value).success, false, value);
});
test('inventory writes require explicit units and reject ownership, archive, and medicine changes', () => {
  assert.equal(inventoryCreateSchema.safeParse(sample).success, true);
  for (const extra of [
    { patientId: sample.medicineId },
    { archivedAt: null },
    { unit: null },
    { unit: 'PILL' },
    { quantity: -1 },
    { notes: '\u0000' },
  ])
    assert.equal(
      inventoryCreateSchema.safeParse({ ...sample, ...extra }).success,
      false,
    );
  assert.equal(
    inventoryCreateSchema.safeParse({
      medicineId: sample.medicineId,
      quantity: 1,
    }).success,
    false,
  );
  for (const patch of [
    {},
    { medicineId: sample.medicineId },
    { patientId: sample.medicineId },
    { archivedAt: null },
    { lowStockThreshold: -0.1 },
  ])
    assert.equal(inventoryPatchSchema.safeParse(patch).success, false);
  assert.equal(
    inventoryPatchSchema.safeParse({
      expiryDate: null,
      lowStockThreshold: null,
      notes: null,
    }).success,
    true,
  );
});
test('inventory filters have bounded pagination and exact boolean/date/sort semantics', () => {
  assert.deepEqual(inventoryQuerySchema.parse({}), {
    status: 'ACTIVE',
    page: 1,
    limit: 20,
    sort: 'created_desc',
  });
  assert.equal(
    inventoryQuerySchema.parse({ lowStock: 'false' }).lowStock,
    false,
  );
  for (const query of [
    { limit: '101' },
    { page: '0' },
    { page: '10001' },
    { page: ['1', '2'] },
    { lowStock: '1' },
    { status: 'ARCHIVED' },
    { status: 'EXPIRED' },
    { sort: 'quantity' },
    { expiryBefore: '2026-02-29' },
    { q: '' },
    { patientId: sample.medicineId },
  ])
    assert.equal(inventoryQuerySchema.safeParse(query).success, false);
});
