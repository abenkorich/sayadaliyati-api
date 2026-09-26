import assert from 'node:assert/strict';
import test from 'node:test';
import { planImport } from '../scripts/miph-plan.mjs';
import {
  assertLocalImport,
  assertImportTarget,
} from '../scripts/miph-database.mjs';

test('publication guard restricts writes to known local databases', () => {
  assert.doesNotThrow(() =>
    assertLocalImport('postgres://localhost/saydaliyati'),
  );
  assert.throws(() => assertLocalImport('postgres://example.com/saydaliyati'));
  assert.throws(() => assertLocalImport('postgres://localhost/production'));
});

const candidate = {
  registrationNumber: '001/TEST',
  name: 'Test medicine',
  genericName: 'Test ingredient',
  strength: '1MG',
  dosageForm: 'TABLET',
  packageSize: 'B/10',
  source: 'MIPH',
  sourceVersion: '2026-08',
  status: 'ACTIVE',
};
const row = {
  sheet: 'test',
  row: 2,
  regulatoryStatus: 'CURRENT',
  candidate,
  issues: [],
};
const stage = { records: [row] };

test('new then repeated input is unchanged and keeps database ID', () => {
  assert.equal(planImport(stage, []).counts.new, 1);
  const plan = planImport(stage, [{ ...candidate, id: 'stable-id' }]);
  assert.equal(plan.counts.unchanged, 1);
  assert.equal(plan.changes[0]?.medicineId, 'stable-id');
});
test('all ambiguous source and database identities require review', () => {
  assert.equal(
    planImport(
      {
        records: [
          { ...row, issues: ['duplicate_registration_requires_review'] },
        ],
      },
      [],
    ).counts.review,
    1,
  );
  assert.equal(planImport(stage, [candidate, candidate]).counts.review, 1);
  assert.equal(
    planImport(stage, [{ ...candidate, source: 'OTHER' }]).counts.review,
    1,
  );
  assert.equal(
    planImport(stage, [{ ...candidate, strength: '2MG' }]).counts.review,
    1,
  );
});
test('explicit regulatory change updates status; absence only requests review', () => {
  const withdrawn = {
    records: [
      {
        ...row,
        regulatoryStatus: 'WITHDRAWN',
        candidate: { ...candidate, status: 'INACTIVE' },
      },
    ],
  };
  assert.equal(planImport(withdrawn, [candidate]).counts.updated, 1);
  const plan = planImport({ records: [] }, [{ ...candidate, id: 'preserved' }]);
  assert.deepEqual(plan.missingFromSource, [
    {
      medicineId: 'preserved',
      registrationNumber: '001/TEST',
      action: 'review',
    },
  ]);
});

test('remote apply requires an exact explicit target', () => {
  const remote = 'postgres://user:secret@dev.example.com:5432/postgres';
  assert.throws(() => assertImportTarget(remote));
  assert.throws(() =>
    assertImportTarget(remote, 'other.example.com:5432/postgres'),
  );
  assert.throws(() => assertImportTarget(remote, 'dev.example.com:5432/other'));
  assert.doesNotThrow(() =>
    assertImportTarget(remote, 'dev.example.com:5432/postgres'),
  );
});
