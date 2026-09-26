import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  barcodeSchema,
  medicineQuerySchema,
  normalizeCatalogText,
} from '@saydaliyati/validation';

test('catalog validation bounds pagination and rejects arrays, unexpected filters and SQL-shaped IDs', () => {
  assert.deepEqual(medicineQuerySchema.parse({}), {
    page: 1,
    limit: 20,
    status: 'ACTIVE',
  });
  for (const input of [
    { page: '0' },
    { page: '10001' },
    { page: '1e2' },
    { limit: '101' },
    { limit: '1.5' },
    { page: ['1', '2'] },
    { sort: 'name' },
    { status: 'DELETED' },
    { q: '' },
    { q: 'null\u0000byte' },
    { q: ' ' },
    { q: 'a'.repeat(201) },
    { manufacturer: "' OR 1=1" },
    { ingredient: 'unknown' },
  ]) {
    assert.equal(
      medicineQuerySchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    );
  }
});
test('catalog normalization preserves accents and Arabic and normalizes canonical Unicode and whitespace', () => {
  assert.equal(normalizeCatalogText('  DE\u0301MO   Bêta '), 'démo bêta');
  assert.equal(normalizeCatalogText(' دواء   تجريبي '), 'دواء تجريبي');
});
test('barcode validation preserves leading zeros and case without guessing barcode semantics', () => {
  assert.equal(barcodeSchema.parse('  0012345678901 '), '0012345678901');
  assert.equal(barcodeSchema.parse('Demo-ABC'), 'Demo-ABC');
  for (const value of ['', ' ', 'a b', 'abc\u0000', 'x'.repeat(101), 1234]) {
    assert.equal(barcodeSchema.safeParse(value).success, false);
  }
});

test('category filtering accepts a category UUID or explicit uncategorized, rejects arbitrary input', () => {
  assert.equal(
    medicineQuerySchema.parse({ category: 'uncategorized' }).category,
    'uncategorized',
  );
  assert.equal(
    medicineQuerySchema.parse({
      category: '11111111-1111-4111-8111-111111111111',
    }).category,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.equal(
    medicineQuerySchema.safeParse({ category: 'allergy' }).success,
    false,
  );
  assert.equal(
    medicineQuerySchema.safeParse({ category: ['uncategorized'] }).success,
    false,
  );
});
