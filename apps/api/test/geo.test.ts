import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readGeoCsv, geoRecord } from '../src/geography/geo.schemas.js';
import { validateDirectoryLocation } from '../src/geography/geo.service.js';
import type { Prisma } from '@saydaliyati/database';
test('geographic CSV accepts attachment aliases and preserves multilingual names', () => {
  assert.equal(
    readGeoCsv(
      'countries',
      '\uFEFFCountry Code,English Name,Arabic Name,French Name\r\nDZ,Algeria,الجزائر,Algérie\r\n',
    )[0]?.nameArabic,
    'الجزائر',
  );
  const w = readGeoCsv(
    'wilayas',
    'wilayaId,name English,Arabic Name,French Name,zone,isDeliverable\n1,"Adrar, region",أدرار,Adrar,4,true',
  );
  assert.equal(w[0]?.isDeliverable, true);
  assert.equal(w[0]?.nameEnglish, 'Adrar, region');
  const c = readGeoCsv(
    'communes',
    'communeId,name,wilayaId,wilayaName English,wilayaName Arabic,wilayaName French\n101,Adrar,1,Adrar,أدرار,Adrar',
  );
  assert.equal(c[0]?.wilayaCode, '1');
  assert.equal(c[0]?.nameArabic, null);
});
test('geographic CSV rejects malformed, duplicate, oversized and ambiguous records', () => {
  for (const csv of [
    'name\nAdrar',
    'wilayaId,name\n1,A\n1,B',
    'wilayaId,name,isDeliverable\n1,A,yes',
    'wilayaId,name\n1,"unclosed',
    'wilayaId,name,English Name\n1,A,B',
  ])
    assert.throws(() => readGeoCsv('wilayas', csv));
  assert.throws(() => readGeoCsv('communes', 'communeId,name\n1,A'));
  assert.throws(() =>
    readGeoCsv('countries', 'Country Code,English Name\nDZA,Algeria'),
  );
  assert.equal(
    readGeoCsv(
      'communes',
      'communeId,name,wilayaId\n' +
        Array.from(
          { length: 1541 },
          (_, i) => `${i + 1},Commune ${i + 1},1`,
        ).join('\n'),
    ).length,
    1541,
  );
  assert.throws(() =>
    readGeoCsv(
      'wilayas',
      'wilayaId,name\n' +
        Array.from({ length: 5001 }, (_, i) => `${i},A`).join('\n'),
    ),
  );
  assert.equal(
    geoRecord.safeParse({ code: 'x', nameEnglish: 'A', parentId: 'bad' })
      .success,
    false,
  );
});
test('directory hierarchy rejects missing ancestors and cross-parent locations', async () => {
  const tx = {
    geoZone: { findFirst: async () => null },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(validateDirectoryLocation(tx, { communeId: 'x' }));
  await assert.rejects(validateDirectoryLocation(tx, { countryId: 'wrong' }));
  await validateDirectoryLocation(tx, {});
});
