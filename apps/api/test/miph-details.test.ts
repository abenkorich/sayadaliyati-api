import assert from 'node:assert/strict';
import { test } from 'node:test';
import { miphDetails } from '../src/catalog/miph-details.js';
import { medicineQuerySchema } from '@saydaliyati/validation';

test('all original MIPH columns survive projection, including blanks, zeros and unknown future fields', () => {
  const raw = {
    CODE: '01 A 003',
    DOSAGE: 0.005,
    OBS: null,
    P1: 'HOP',
    'NEW COLUMN': 0,
    'DATE DE RETRAIT': '2026-08-01T00:00:00',
  };
  const result = miphDetails(
    'MIPH',
    {
      raw,
      rawNumberFormats: { DOSAGE: '0.0%' },
      sheet: 'Retraits',
      row: 23,
      sourceUrl: 'https://www.miph.gov.dz/source.xlsx',
      internal: 'not public',
    },
    'checksum',
  );
  assert.ok(result);
  assert.deepEqual(
    Object.fromEntries(result.fields.map((f) => [f.name, f.value])),
    raw,
  );
  assert.equal(
    result.fields.find((f) => f.name === 'DOSAGE')?.displayValue,
    '0.5%',
  );
  assert.equal(
    result.fields.find((f) => f.name === 'NEW COLUMN')?.displayValue,
    '0',
  );
  assert.equal(result.fields.find((f) => f.name === 'OBS')?.displayValue, null);
  assert.equal(result.sheet, 'Retraits');
  assert.equal('internal' in result, false);
});
test('non-MIPH records and malformed metadata do not expose arbitrary metadata or links', () => {
  assert.equal(miphDetails('OTHER', { raw: { CODE: 'x' } }, null), null);
  assert.equal(miphDetails('MIPH', null, null), null);
  assert.equal(miphDetails('MIPH', { raw: [] }, null), null);
  assert.equal(
    miphDetails('MIPH', { raw: {}, sourceUrl: 'javascript:alert(1)' }, null)
      ?.sourceUrl,
    null,
  );
});
test('directory filters preserve exact lab names and barcode case/zeros and reject malformed values', () => {
  const q = medicineQuerySchema.parse({
    laboratory: ' EL KENDI ',
    holderCountry: 'ALGERIE',
    dosageForm: 'COMPRIME',
    status: 'ALL',
    regulatoryStatus: 'WITHDRAWN',
    barcode: '00AbC',
    q: ' 00AbC ',
  });
  assert.equal(q.laboratory, 'EL KENDI');
  assert.equal(q.barcode, '00AbC');
  assert.equal(q.q, '00AbC');
  for (const input of [
    { laboratory: '' },
    { laboratory: ['a'] },
    { holderCountry: 'x'.repeat(256) },
    { dosageForm: 'x\u0000' },
    { regulatoryStatus: 'OTHER' },
    { barcode: 'a b' },
  ])
    assert.equal(medicineQuerySchema.safeParse(input).success, false);
});
