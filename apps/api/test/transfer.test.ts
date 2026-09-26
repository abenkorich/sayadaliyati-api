import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  parseCsv,
  parseTransfer,
  serialize,
  MAX_FILE_BYTES,
  type TransferRow,
} from '../src/admin/transfer-format.js';
import { AdminTransferService } from '../src/admin/transfer.service.js';
import type { DatabaseService } from '../src/database.service.js';
import type { AuthService } from '../src/auth/auth.service.js';
import type { ApiConfig } from '../src/config.js';
const medicine: TransferRow = {
  name: 'Médicament صيدلية, "A"',
  genericName: null,
  strength: '10 mg',
  dosageForm: null,
  status: 'INACTIVE',
  source: 'Reviewed\nsource',
};
test('JSON and CSV round-trip Unicode, quotes, commas, multiline fields and optional nulls', () => {
  for (const format of ['json', 'csv'] as const) {
    const parsed = parseTransfer(
      'medicines',
      format,
      serialize('medicines', format, [medicine]),
    );
    assert.deepEqual(parsed.issues, []);
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(medicine).map((k) => [k, parsed.rows[0]?.[k]]),
      ),
      medicine,
    );
  }
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x,y","line 1\nline 2"\r\n'), [
    ['a', 'b'],
    ['x,y', 'line 1\nline 2'],
  ]);
});
test('CSV formula escaping is reversible, including literal apostrophes and international phones', () => {
  for (const name of [
    '=1+1',
    '+213123',
    '-10',
    '@SUM(A1)',
    "'=literal",
    "''literal",
    '  =danger',
    '\t=cell',
  ]) {
    const content = serialize('medicines', 'csv', [{ ...medicine, name }]);
    assert.ok(content.includes('"\''));
    const parsed = parseTransfer('medicines', 'csv', content);
    assert.deepEqual(parsed.issues, []);
    assert.equal(parsed.rows[0]?.name, name.trim());
  }
});
test('import rejects malformed CSV, duplicate/unknown headers, extra columns, invalid JSON and oversized input', () => {
  for (const content of [
    'name,name\na,b',
    'name,password\na,secret',
    'name\na,b',
    'name\n"unclosed',
    'name\n"a"tail',
  ])
    assert.ok(parseTransfer('medicines', 'csv', content).issues.length);
  for (const content of [
    '{}',
    '[]',
    '{',
    '[null]',
    '[' + Array(501).fill(JSON.stringify(medicine)).join(',') + ']',
  ])
    assert.ok(parseTransfer('medicines', 'json', content).issues.length);
  assert.ok(
    parseTransfer('medicines', 'json', 'é'.repeat(MAX_FILE_BYTES)).issues
      .length,
  );
  const result = parseTransfer(
    'medicines',
    'json',
    JSON.stringify([
      { ...medicine, id: randomUUID(), password: 'never echo this' },
    ]),
  );
  assert.ok(result.issues.length);
  assert.ok(!JSON.stringify(result).includes('never echo this'));
});
test('IDs are strict, duplicate IDs rejected, user creation and credential imports are refused', () => {
  const id = randomUUID();
  assert.ok(
    parseTransfer(
      'medicines',
      'json',
      JSON.stringify([
        { ...medicine, id },
        { ...medicine, id },
      ]),
    ).issues.some((x) => x.field === 'id'),
  );
  assert.ok(
    parseTransfer('users', 'json', '[{"status":"ACTIVE"}]').issues.length,
  );
  assert.ok(
    parseTransfer(
      'users',
      'json',
      JSON.stringify([{ id, status: 'ACTIVE', passwordHash: 'secret' }]),
    ).issues.length,
  );
  assert.deepEqual(
    parseTransfer(
      'users',
      'csv',
      `id,email,phone,role,status,createdAt,lastLoginAt\n${id},,,,SUSPENDED,,`,
    ).issues,
    [],
  );
  assert.ok(
    parseTransfer(
      'settings',
      'json',
      JSON.stringify([
        {
          organizationName: 'Test',
          supportEmail: null,
          defaultLanguage: 'EN',
          timezone: 'Bad/Zone',
        },
      ]),
    ).issues.length,
  );
});
test('all transfer operations reject non-admin actors before database access', async () => {
  const db = new Proxy(
    {},
    {
      get() {
        throw new Error('No storage access allowed');
      },
    },
  ) as DatabaseService;
  const service = new AdminTransferService(
    db,
    {} as AuthService,
    { AUTH_SECRET: 'ab'.repeat(32) } as ApiConfig,
  );
  for (const role of ['PATIENT', 'DOCTOR', 'PHARMACY']) {
    const actor = { userId: randomUUID(), sessionId: randomUUID(), role };
    await assert.rejects(
      () =>
        service.preview(actor, 'medicines', { format: 'json', content: '[]' }),
      { message: 'Access is denied.' },
    );
    await assert.rejects(
      () =>
        service.apply(
          actor,
          'users',
          { format: 'json', content: '[]', token: 'forged' },
          'request',
        ),
      { message: 'Access is denied.' },
    );
    await assert.rejects(
      () => service.export(actor, 'users', 'csv', '', false, 'request'),
      { message: 'Access is denied.' },
    );
  }
});

test('full medicine JSON and CSV retain category, lists, metadata and long details', () => {
  const native = {
    ...medicine,
    brandName: 'Brand',
    strength: 'x'.repeat(500),
    packageSize: 'Box of 20',
    categoryId: null,
    categorySlug: 'pain-relief',
    categoryName: 'Pain relief',
    manufacturerId: null,
    manufacturerName: 'Lab',
    manufacturerCountry: 'DZ',
    manufacturerWebsite: 'https://example.test',
    boxImageUrl: 'https://example.test/box.jpg',
    sourceMetadata: {
      raw: { 'Original column': 'Échantillon, الجزائر', quantity: 0 },
      flags: [true, null],
    },
    ingredients: [
      { name: 'Ingredient', description: null, amount: '12.5000', unit: 'mg' },
    ],
    barcodes: [
      { barcode: '0012345678901', barcodeType: 'EAN13', country: 'DZ' },
    ],
    images: [
      {
        url: 'https://example.test/box.jpg',
        imageType: 'FRONT',
        sortOrder: 0,
        source: null,
      },
    ],
  };
  const parsed = parseTransfer('medicines', 'json', JSON.stringify([native]));
  assert.deepEqual(parsed.issues, []);
  for (const format of ['json', 'csv'] as const) {
    const content = serialize('medicines', format, parsed.rows);
    const again = parseTransfer('medicines', format, content);
    assert.deepEqual(again.issues, []);
    for (const key of Object.keys(native))
      assert.equal(again.rows[0]?.[key], parsed.rows[0]?.[key]);
  }
  const exported = JSON.parse(serialize('medicines', 'json', parsed.rows))[0];
  assert.equal(exported.categorySlug, 'pain-relief');
  assert.equal(exported.barcodes[0].barcode, '0012345678901');
  assert.equal(exported.ingredients[0].amount, '12.5');
  assert.equal(exported.sourceMetadata.raw.quantity, 0);
  const old = parseTransfer(
    'medicines',
    'csv',
    'name,genericName,strength,dosageForm,status,source\nLegacy,,,,INACTIVE,manual\n',
  );
  assert.deepEqual(old.issues, []);
  assert.equal('categoryId' in old.rows[0]!, false);
  assert.equal('ingredients' in old.rows[0]!, false);
});
test('medicine detail validation rejects invalid JSON cells, unsafe URLs, duplicate relations and malformed amounts', () => {
  for (const extra of [
    { regulatoryStatus: 'REGISTERED' },
    {
      images: [
        {
          url: 'http://example.test/x',
          imageType: 'FRONT',
          sortOrder: 0,
          source: null,
        },
      ],
    },
    { boxImageUrl: 'javascript:alert(1)' },
    {
      barcodes: [
        { barcode: 'with spaces', barcodeType: 'OTHER', country: null },
      ],
    },
    { ingredients: [{ name: 'Test', amount: '0.00001', unit: 'mg' }] },
    { sourceMetadata: '{broken' },
    { images: 'not-json' },
    { categoryId: 'bad' },
    {
      ingredients: [
        { name: 'A', amount: null, unit: null },
        { name: 'A', amount: null, unit: null },
      ],
    },
  ])
    assert.ok(
      parseTransfer(
        'medicines',
        'json',
        JSON.stringify([{ ...medicine, ...extra }]),
      ).issues.length,
      JSON.stringify(extra),
    );
});

test('blank CSV read-only columns are omitted and do not block existing medicine updates', () => {
  const content = `id,name,genericName,strength,dosageForm,status,source,createdAt,updatedAt,normalizedName\n${randomUUID()},Example,,,,INACTIVE,manual,,,\n`;
  const result = parseTransfer('medicines', 'csv', content);
  assert.deepEqual(result.issues, []);
  for (const key of ['createdAt', 'updatedAt', 'normalizedName'])
    assert.equal(key in result.rows[0]!, false);
});
