import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { Redis } from 'ioredis';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
import { TokensService } from '../dist/auth/tokens.service.js';
for (const value of [
  process.env['TEST_DATABASE_URL'],
  process.env['TEST_RUNTIME_DATABASE_URL'],
]) {
  assert.ok(value);
  const url = new URL(value);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/saydaliyati_test');
}
const redisUrl = process.env['TEST_REDIS_URL'];
assert.ok(redisUrl);
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(redisUrl).hostname),
);
assert.equal(new URL(redisUrl).pathname, '/1');
const owner = createDatabaseClient(process.env['TEST_DATABASE_URL']);
const runtime = createDatabaseClient(process.env['TEST_RUNTIME_DATABASE_URL']);
const config = readConfig({
  NODE_ENV: 'test',
  AUTH_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: process.env['TEST_RUNTIME_DATABASE_URL'],
  REDIS_URL: redisUrl,
});
const signer = new TokensService(config),
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const users = [randomUUID(), randomUUID()],
  medicineId = randomUUID(),
  sessions = [randomUUID(), randomUUID(), randomUUID()];
const tokens = [];
let app, base;
const body = (line = {}) => ({
  source: 'MANUAL',
  prescriptionDate: '2026-09-24',
  validUntil: '2026-10-24',
  medications: [{ medicineId, ...line }],
});
async function request(path = '', method = 'GET', payload, token = tokens[0]) {
  const response = await fetch(`${base}/api/v1/me/prescriptions${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
async function create(line = {}, token = tokens[0]) {
  const result = await request('', 'POST', body(line), token);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.data;
}
const field = (row, name) =>
  row.medications[0].fields.find((value) => value.fieldName === name);
async function cleanup() {
  const prescriptions = await owner.prescription.findMany({
    where: { patientId: { in: users } },
    select: { id: true },
  });
  const ids = prescriptions.map((row) => row.id);
  await owner.prescriptionExtractedField.deleteMany({
    where: { medication: { prescriptionId: { in: ids } } },
  });
  await owner.prescriptionMedication.deleteMany({
    where: { prescriptionId: { in: ids } },
  });
  await owner.prescriptionDocument.deleteMany({
    where: { prescriptionId: { in: ids } },
  });
  await owner.prescription.deleteMany({ where: { id: { in: ids } } });
  await owner.auditLog.deleteMany({ where: { actorId: { in: users } } });
}
before(async () => {
  for (const id of users)
    await owner.user.create({ data: { id, email: `${id}@example.test` } });
  await owner.medicine.create({
    data: {
      id: medicineId,
      name: 'DEMO prescription fixture',
      normalizedName: 'demo prescription fixture',
      source: 'SYNTHETIC_TEST_FIXTURE',
    },
  });
  const expiresAt = new Date(Date.now() + 3600000);
  for (const [index, id] of sessions.entries()) {
    const userId = index === 1 ? users[1] : users[0];
    await owner.session.create({
      data: { id, userId, refreshTokenHash: 'synthetic-only', expiresAt },
    });
    tokens.push(await signer.access(userId, id, expiresAt));
  }
  app = await createApplication(config);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
beforeEach(async () => {
  await cleanup();
  await owner.user.updateMany({
    where: { id: { in: users } },
    data: { role: 'PATIENT', status: 'ACTIVE' },
  });
  await redis.del(
    `saydaliyati:auth:protected-ip:${signer.rateDigest('127.0.0.1')}`,
  );
});
after(async () => {
  try {
    await cleanup();
    await owner.session.deleteMany({ where: { userId: { in: users } } });
    await owner.user.deleteMany({ where: { id: { in: users } } });
    await owner.medicine.delete({ where: { id: medicineId } });
  } finally {
    await app?.close();
    await owner.$disconnect();
    await runtime.$disconnect();
    redis.disconnect();
  }
});

test('manual creation persists an unconfirmed DRAFT with unknown values, USER revisions and no OCR documents/job', async () => {
  const row = await create({ instructions: 'Synthetic private instruction' });
  assert.equal(row.status, 'DRAFT');
  assert.equal(row.processingStatus, null);
  assert.deepEqual(row.documents, []);
  assert.equal(row.medications[0].quantity, null);
  assert.equal(row.medications[0].dosage, null);
  assert.equal(row.medications[0].confirmationStatus, 'PENDING');
  assert.equal(row.medications[0].fields.length, 14);
  assert.ok(
    row.medications[0].fields.every(
      (f) =>
        f.source === 'USER' &&
        f.confidence === null &&
        !f.confirmed &&
        f.revision === 1,
    ),
  );
  const stored = await owner.prescription.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.equal(stored.patientId, users[0]);
  const audit = await owner.auditLog.findMany({
    where: { resourceId: row.id },
  });
  assert.equal(audit.length, 1);
  assert.ok(!JSON.stringify(audit).includes('Synthetic private instruction'));
});
test('owner lists paginate deterministically and never include another patient’s prescriptions', async () => {
  await create();
  await create();
  await create({}, tokens[1]);
  const page = await request('?limit=1');
  assert.deepEqual(page.body.meta, {
    page: 1,
    limit: 1,
    total: 2,
    totalPages: 2,
  });
  assert.notEqual(
    page.body.data[0].id,
    (await request('?limit=1&page=2')).body.data[0].id,
  );
  assert.equal(
    (await request('', 'GET', undefined, tokens[1])).body.meta.total,
    1,
  );
});
test('all prescription operations require patient authentication and reject cross-owner access', async () => {
  const row = await create();
  const review = {
    fieldReviews: [
      { fieldId: field(row, 'quantity').id, value: 1, confirmed: true },
    ],
  };
  for (const [path, method, input] of [
    ['', 'GET'],
    ['', 'POST', body()],
    [`/${row.id}`, 'GET'],
    [`/${row.id}`, 'PATCH', review],
    [`/${row.id}`, 'DELETE'],
  ]) {
    assert.equal((await request(path, method, input, null)).status, 401);
    for (const role of ['DOCTOR', 'PHARMACY', 'ADMIN']) {
      await owner.user.update({ where: { id: users[1] }, data: { role } });
      assert.equal((await request(path, method, input, tokens[1])).status, 403);
    }
  }
  await owner.user.update({
    where: { id: users[1] },
    data: { role: 'PATIENT' },
  });
  for (const [method, input] of [['GET'], ['PATCH', review], ['DELETE']])
    assert.equal(
      (await request(`/${row.id}`, method, input, tokens[1])).status,
      404,
    );
});
test('invalid manual input cannot forge provenance, doctor identity, confirmation, dates or quantities', async () => {
  for (const input of [
    { ...body(), status: 'CONFIRMED' },
    { ...body(), doctorId: users[1] },
    { ...body(), source: 'SCANNED' },
    { ...body(), patientId: users[1] },
    { ...body(), processingStatus: 'COMPLETED' },
    { ...body(), medications: [] },
    body({ quantity: 0 }),
    body({ dosage: -1 }),
    body({ quantity: 0.0001 }),
    body({ confidence: 1 }),
    body({ medicineId: randomUUID() }),
    { ...body(), validUntil: '2026-09-23' },
  ]) {
    assert.ok([400, 404].includes((await request('', 'POST', input)).status));
  }
  assert.equal(
    await owner.prescription.count({ where: { patientId: users[0] } }),
    0,
  );
});
test('field edits append USER revisions, synchronize summaries and preserve original values', async () => {
  const row = await create({ quantity: 2 });
  const original = field(row, 'quantity');
  const result = await request(`/${row.id}`, 'PATCH', {
    fieldReviews: [{ fieldId: original.id, value: 3.125, confirmed: true }],
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.medications[0].quantity, '3.125');
  const revised = field(result.body.data, 'quantity');
  assert.equal(revised.revision, 2);
  assert.equal(revised.confirmed, true);
  assert.ok(revised.confirmedAt);
  assert.equal(
    (
      await owner.prescriptionExtractedField.findUniqueOrThrow({
        where: { id: original.id },
      })
    ).value,
    2,
  );
  const stored = await owner.prescriptionExtractedField.findUniqueOrThrow({
    where: { id: revised.id },
  });
  assert.equal(stored.confirmedBy, users[0]);
  assert.equal(stored.source, 'USER');
  assert.equal(stored.confidence, null);
});
test('pure confirmation retains source and never promotes a draft or activates treatment', async () => {
  const row = await create({ quantity: 2 });
  const result = await request(`/${row.id}`, 'PATCH', {
    fieldReviews: row.medications[0].fields.map((f) => ({
      fieldId: f.id,
      value: f.value,
      confirmed: true,
    })),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.status, 'DRAFT');
  assert.equal(result.body.data.processingStatus, null);
  assert.equal(result.body.data.medications[0].confirmationStatus, 'PENDING');
  assert.ok(
    result.body.data.medications[0].fields.every(
      (f) => f.source === 'USER' && f.confirmed,
    ),
  );
  assert.equal(
    (await request(`/${row.id}`, 'PATCH', { status: 'CONFIRMED' })).status,
    400,
  );
});
test('stale, foreign and concurrent field reviews cannot overwrite current revisions', async () => {
  const row = await create({ quantity: 2 });
  const other = await create({}, tokens[1]);
  const input = {
    fieldReviews: [
      { fieldId: field(row, 'quantity').id, value: 3, confirmed: false },
    ],
  };
  const results = await Promise.all([
    request(`/${row.id}`, 'PATCH', input),
    request(`/${row.id}`, 'PATCH', input, tokens[2]),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await request(`/${row.id}`, 'PATCH', input)).body.error.code,
    'PRESCRIPTION_REVIEW_CONFLICT',
  );
  assert.equal(
    (
      await request(`/${row.id}`, 'PATCH', {
        fieldReviews: [
          { fieldId: field(other, 'quantity').id, value: 1, confirmed: true },
        ],
      })
    ).status,
    409,
  );
  assert.equal(
    await owner.prescriptionExtractedField.count({
      where: {
        prescriptionMedicationId: row.medications[0].id,
        fieldName: 'quantity',
      },
    }),
    2,
  );
});
test('field-specific validation and compound date/identity checks roll back all reviews in a request', async () => {
  const row = await create({
    quantity: 2,
    startDate: '2026-09-24',
    endDate: '2026-09-30',
  });
  for (const [name, value] of [
    ['quantity', 0],
    ['dosage', -1],
    ['quantity', '3'],
    ['scheduledTimes', ['25:00']],
    ['medicineId', null],
    ['startDate', '2026-10-01'],
  ]) {
    const result = await request(`/${row.id}`, 'PATCH', {
      fieldReviews: [{ fieldId: field(row, name).id, value, confirmed: true }],
    });
    assert.equal(result.status, 400);
  }
  const mixed = await request(`/${row.id}`, 'PATCH', {
    fieldReviews: [
      { fieldId: field(row, 'quantity').id, value: 3, confirmed: true },
      { fieldId: field(row, 'dosage').id, value: -1, confirmed: true },
    ],
  });
  assert.equal(mixed.status, 400);
  assert.equal(
    (await request(`/${row.id}`)).body.data.medications[0].quantity,
    '2',
  );
});
test('rejected medication lines remain in history and cannot be edited back into treatment input', async () => {
  const row = await create();
  const id = row.medications[0].id;
  const rejected = await request(`/${row.id}`, 'PATCH', {
    rejectedMedicationIds: [id],
  });
  assert.equal(rejected.status, 200);
  assert.equal(
    rejected.body.data.medications[0].confirmationStatus,
    'REJECTED',
  );
  assert.equal(rejected.body.data.medications[0].fields.length, 14);
  assert.equal(
    (
      await request(`/${row.id}`, 'PATCH', {
        fieldReviews: [
          { fieldId: field(row, 'quantity').id, value: 1, confirmed: true },
        ],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/${row.id}`, 'PATCH', {
        rejectedMedicationIds: [randomUUID()],
      })
    ).status,
    404,
  );
});
test('archive is idempotent, preserves revisions/documents and excludes records from the default list', async () => {
  const row = await create();
  const results = await Promise.all([
    request(`/${row.id}`, 'DELETE'),
    request(`/${row.id}`, 'DELETE', undefined, tokens[2]),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal((await request('')).body.meta.total, 0);
  assert.equal((await request('?status=ARCHIVED')).body.meta.total, 1);
  const archived = await request(`/${row.id}`);
  assert.equal(archived.body.data.status, 'ARCHIVED');
  assert.equal(archived.body.data.medications[0].fields.length, 14);
  assert.equal(
    (
      await request(`/${row.id}`, 'PATCH', {
        fieldReviews: [
          { fieldId: field(row, 'quantity').id, value: 1, confirmed: true },
        ],
      })
    ).status,
    409,
  );
  assert.equal(
    await owner.auditLog.count({
      where: { resourceId: row.id, action: 'PRESCRIPTION_ARCHIVED' },
    }),
    1,
  );
});
test('audit failure rolls back prescription creation, field revisions, summaries and archive', async () => {
  const row = await create({ quantity: 2 });
  await owner.$executeRaw`REVOKE INSERT ON audit_logs FROM saydaliyati_app`;
  try {
    assert.equal((await request('', 'POST', body())).status, 500);
    assert.equal(
      (
        await request(`/${row.id}`, 'PATCH', {
          fieldReviews: [
            { fieldId: field(row, 'quantity').id, value: 3, confirmed: true },
          ],
        })
      ).status,
      500,
    );
    assert.equal((await request(`/${row.id}`, 'DELETE')).status, 500);
  } finally {
    await owner.$executeRaw`GRANT INSERT ON audit_logs TO saydaliyati_app`;
  }
  assert.equal(
    await owner.prescription.count({ where: { patientId: users[0] } }),
    1,
  );
  assert.equal(
    await owner.prescriptionExtractedField.count({
      where: { prescriptionMedicationId: row.medications[0].id },
    }),
    14,
  );
  const unchanged = (await request(`/${row.id}`)).body.data;
  assert.equal(unchanged.status, 'DRAFT');
  assert.equal(unchanged.medications[0].quantity, '2');
});
test('runtime cannot mutate field history, delete prescriptions/documents or reassign owners', async () => {
  const row = await create();
  const id = field(row, 'quantity').id;
  await assert.rejects(
    runtime.prescriptionExtractedField.update({
      where: { id },
      data: { confirmed: true },
    }),
  );
  await assert.rejects(
    runtime.prescriptionExtractedField.delete({ where: { id } }),
  );
  await assert.rejects(runtime.prescription.delete({ where: { id: row.id } }));
  await assert.rejects(
    runtime.prescription.update({
      where: { id: row.id },
      data: { patientId: users[1] },
    }),
  );
  await assert.rejects(
    runtime.prescriptionDocument.deleteMany({
      where: { prescriptionId: row.id },
    }),
  );
});
test('document metadata enforces parent ownership and omits storage keys; scan remains unavailable and missing stored bytes fail closed', async () => {
  const row = await create();
  // A synthetic future scanned header exercises metadata only; no file is uploaded.
  await owner.prescription.update({
    where: { id: row.id },
    data: { source: 'SCANNED', processingStatus: 'UPLOADED' },
  });
  await assert.rejects(
    owner.prescriptionDocument.create({
      data: {
        prescriptionId: row.id,
        patientId: users[1],
        pageNumber: 1,
        storageKey: `synthetic/${randomUUID()}`,
        mimeType: 'image/png',
        processingStatus: 'UPLOADED',
      },
    }),
  );
  const document = await owner.prescriptionDocument.create({
    data: {
      prescriptionId: row.id,
      patientId: users[0],
      pageNumber: 1,
      storageKey: `synthetic/${randomUUID()}`,
      mimeType: 'image/png',
      processingStatus: 'UPLOADED',
    },
  });
  const detail = (await request(`/${row.id}`)).body.data;
  assert.deepEqual(detail.documents, [
    {
      id: document.id,
      pageNumber: 1,
      mimeType: 'image/png',
      processingStatus: 'UPLOADED',
    },
  ]);
  assert.ok(!JSON.stringify(detail).includes(document.storageKey));
  assert.equal((await request('/scan', 'POST', {})).status, 404);
  assert.equal(
    (await request(`/${row.id}/documents/${document.id}/download`)).status,
    503,
  );
  await request(`/${row.id}`, 'DELETE');
  assert.equal(
    await owner.prescriptionDocument.count({ where: { id: document.id } }),
    1,
  );
});
test('database enforces positive quantities, valid confidence, confirmation actor and unique revisions', async () => {
  const row = await create();
  const medicationId = row.medications[0].id;
  await assert.rejects(
    owner.prescriptionMedication.update({
      where: { id: medicationId },
      data: { quantity: 0 },
    }),
  );
  await assert.rejects(
    owner.prescriptionMedication.update({
      where: { id: medicationId },
      data: { dosage: 'NaN' },
    }),
  );
  await assert.rejects(
    owner.prescriptionExtractedField.create({
      data: {
        prescriptionMedicationId: medicationId,
        fieldName: 'quantity',
        revision: 2,
        source: 'USER',
        confirmed: true,
      },
    }),
  );
  await assert.rejects(
    owner.prescriptionExtractedField.create({
      data: {
        prescriptionMedicationId: medicationId,
        fieldName: 'quantity',
        revision: 1,
        source: 'USER',
        confirmed: false,
      },
    }),
  );
  await assert.rejects(
    owner.prescriptionExtractedField.create({
      data: {
        prescriptionMedicationId: medicationId,
        fieldName: 'quantity',
        revision: 2,
        source: 'USER',
        confidence: 2,
        confirmed: false,
      },
    }),
  );
  await assert.rejects(owner.prescription.delete({ where: { id: row.id } }));
});
