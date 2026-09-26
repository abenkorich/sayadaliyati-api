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
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows)), [medicine]);
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
