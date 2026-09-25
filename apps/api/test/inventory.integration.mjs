import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { Redis } from 'ioredis';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
import { PasswordsService } from '../dist/auth/passwords.service.js';
import { TokensService } from '../dist/auth/tokens.service.js';

const ownerUrl = process.env['TEST_DATABASE_URL'],
  runtimeUrl = process.env['TEST_RUNTIME_DATABASE_URL'];
const redisUrl = process.env['TEST_REDIS_URL'];
for (const value of [ownerUrl, runtimeUrl]) {
  assert.ok(value, 'Use the root integration-test command');
  const url = new URL(value);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/saydaliyati_test');
}
assert.ok(redisUrl);
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(redisUrl).hostname),
);
assert.equal(new URL(redisUrl).pathname, '/1');
const owner = createDatabaseClient(ownerUrl),
  runtime = createDatabaseClient(runtimeUrl);
const config = readConfig({
  NODE_ENV: 'test',
  AUTH_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: runtimeUrl,
  REDIS_URL: redisUrl,
});
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const signer = new TokensService(config);
const namespace = randomUUID(),
  patients = [randomUUID(), randomUUID()];
const medicineIds = [randomUUID(), randomUUID(), randomUUID()];
const sessions = [randomUUID(), randomUUID(), randomUUID()];
const password = 'synthetic inventory integration password';
const tokens = [];
let app, base;
const record = (extra = {}) => ({
  medicineId: medicineIds[0],
  quantity: 30,
  unit: 'CAPSULE',
  ...extra,
});
async function request(path = '', method = 'GET', body, token = tokens[0]) {
  const response = await fetch(
    `${base}/api/v1${path.startsWith('/auth') || path.startsWith('/medicines') ? path : `/me/inventory${path}`}`,
    {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  );
  return {
    status: response.status,
    body: await response.json(),
    requestId: response.headers.get('x-request-id'),
  };
}
async function create(extra = {}, token = tokens[0]) {
  const response = await request('', 'POST', record(extra), token);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}
async function clearOwnedRows() {
  await owner.auditLog.deleteMany({ where: { actorId: { in: patients } } });
  await owner.medicationInventory.deleteMany({
    where: { patientId: { in: patients } },
  });
}
before(async () => {
  app = await createApplication(config);
  const passwordHash = await app.get(PasswordsService).hash(password);
  for (const [index, id] of patients.entries()) {
    await owner.user.create({
      data: { id, email: `${namespace}-${index}@example.test`, passwordHash },
    });
    await owner.patientProfile.create({
      data: {
        userId: id,
        firstName: 'Synthetic',
        lastName: 'Fixture',
        timezone: 'Africa/Algiers',
      },
    });
  }
  const expiry = new Date(Date.now() + 3600000);
  for (const [index, id] of sessions.entries()) {
    const userId = index === 1 ? patients[1] : patients[0];
    await owner.session.create({
      data: {
        id,
        userId,
        refreshTokenHash: 'synthetic-test-only',
        expiresAt: expiry,
      },
    });
    tokens.push(await signer.access(userId, id, expiry));
  }
  for (const [index, id] of medicineIds.entries()) {
    const name = `${index === 0 ? 'Alpha' : index === 1 ? 'Bêta' : 'Archived'} DEMO ${namespace}`;
    await owner.medicine.create({
      data: {
        id,
        name,
        normalizedName: name.toLowerCase(),
        status: index === 2 ? 'ARCHIVED' : 'ACTIVE',
        source: 'SYNTHETIC_TEST_FIXTURE',
        barcodes: {
          create: { barcode: `${namespace}-${index}`, barcodeType: 'OTHER' },
        },
      },
    });
  }
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
beforeEach(async () => {
  await clearOwnedRows();
  await owner.user.updateMany({
    where: { id: { in: patients } },
    data: { role: 'PATIENT', status: 'ACTIVE' },
  });
  await owner.session.updateMany({
    where: { id: { in: sessions } },
    data: { revokedAt: null, expiresAt: new Date(Date.now() + 3600000) },
  });
  await redis.del(
    `saydaliyati:auth:protected-ip:${signer.rateDigest('127.0.0.1')}`,
  );
});
after(async () => {
  try {
    await clearOwnedRows();
    await owner.session.deleteMany({ where: { userId: { in: patients } } });
    await owner.patientProfile.deleteMany({
      where: { userId: { in: patients } },
    });
    await owner.user.deleteMany({ where: { id: { in: patients } } });
    await owner.medicineBarcode.deleteMany({
      where: { medicineId: { in: medicineIds } },
    });
    await owner.medicine.deleteMany({ where: { id: { in: medicineIds } } });
  } finally {
    await app?.close();
    await owner.$disconnect();
    await runtime.$disconnect();
    redis.disconnect();
  }
});

test('API journey: login, catalog barcode/manual selection, add a batch and view owner inventory', async () => {
  const login = await request(
    '/auth/login',
    'POST',
    { identifier: `${namespace}-0@example.test`, password },
    null,
  );
  assert.equal(login.status, 200);
  const token = login.body.data.accessToken;
  const catalog = await request(
    `/medicines?q=${namespace}`,
    'GET',
    undefined,
    token,
  );
  assert.equal(catalog.body.meta.total, 2);
  const found = await request(
    `/medicines/barcode/${namespace}-0`,
    'GET',
    undefined,
    token,
  );
  const result = await request(
    '',
    'POST',
    record({
      medicineId: found.body.data.id,
      batchNumber: 'DEMO-A',
      expiryDate: '2028-02-29',
      purchaseDate: '2026-09-24',
      lowStockThreshold: 5,
      notes: 'Synthetic private note',
      source: 'SCAN',
      storageLocation: 'Demo location',
    }),
    token,
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const row = result.body.data;
  assert.equal(row.quantity, '30');
  assert.equal(row.lowStockThreshold, '5');
  assert.equal(row.isLowStock, false);
  assert.equal(row.expiryDate, '2028-02-29');
  assert.equal(row.purchaseDate, '2026-09-24');
  assert.equal(row.patientId, undefined);
  assert.equal(row.archivedAt, undefined);
  const persisted = await owner.medicationInventory.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.equal(persisted.patientId, patients[0]);
  const list = await request('', 'GET', undefined, token);
  assert.deepEqual(
    list.body.data.map((entry) => entry.id),
    [row.id],
  );
  const audit = await owner.auditLog.findMany({
    where: { resourceId: row.id },
  });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'INVENTORY_CREATED');
  assert.deepEqual(audit[0].metadata, {
    requestId: result.requestId,
    result: 'SUCCESS',
  });
  assert.ok(!JSON.stringify(audit).includes('Synthetic private note'));
});
test('each add creates a separate batch and preserves exact fractional quantities', async () => {
  const first = await create({
    quantity: 12.345,
    unit: 'ML',
    batchNumber: 'A',
  });
  const second = await create({ quantity: 0, unit: 'ML', batchNumber: 'B' });
  assert.notEqual(first.id, second.id);
  assert.equal(first.quantity, '12.345');
  assert.equal(second.quantity, '0');
  assert.equal((await request('')).body.meta.total, 2);
});
test('all inventory routes reject missing credentials and privileged roles have no owner-route bypass', async () => {
  const row = await create();
  for (const [path, method, body] of [
    ['', 'GET'],
    ['', 'POST', record()],
    [`/${row.id}`, 'GET'],
    [`/${row.id}`, 'PATCH', { quantity: 2 }],
    [`/${row.id}`, 'DELETE'],
  ]) {
    assert.equal((await request(path, method, body, null)).status, 401);
    for (const role of ['DOCTOR', 'PHARMACY', 'ADMIN']) {
      await owner.user.update({ where: { id: patients[1] }, data: { role } });
      assert.equal((await request(path, method, body, tokens[1])).status, 403);
    }
  }
});
test('patients cannot read, edit, archive or list another patient’s inventory', async () => {
  const row = await create();
  const other = await create({ medicineId: medicineIds[1] }, tokens[1]);
  for (const [method, body] of [
    ['GET'],
    ['PATCH', { quantity: 1 }],
    ['DELETE'],
  ]) {
    const result = await request(`/${row.id}`, method, body, tokens[1]);
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, 'RESOURCE_NOT_FOUND');
  }
  assert.deepEqual(
    (await request('', 'GET', undefined, tokens[1])).body.data.map((r) => r.id),
    [other.id],
  );
  assert.equal(
    (
      await request(
        `?medicineId=${medicineIds[0]}`,
        'GET',
        undefined,
        tokens[1],
      )
    ).body.meta.total,
    0,
  );
  assert.equal(
    (
      await owner.medicationInventory.findUniqueOrThrow({
        where: { id: row.id },
      })
    ).quantity.toString(),
    '30',
  );
});
test('strict create validation rejects privilege injection, invalid dates, units and precision without partial writes', async () => {
  for (const extra of [
    { patientId: patients[1] },
    { archivedAt: '2026-09-24T00:00:00Z' },
    { id: randomUUID() },
    { quantity: -1 },
    { quantity: 1.2345 },
    { quantity: 1000000000 },
    { quantity: '1' },
    { unit: null },
    { unit: 'PILL' },
    { expiryDate: '2026-02-29' },
    { purchaseDate: '2026-04-31' },
    { lowStockThreshold: -1 },
    { source: 'AI' },
    { notes: 'x'.repeat(4001) },
  ]) {
    assert.equal(
      (await request('', 'POST', record(extra))).status,
      400,
      JSON.stringify(extra),
    );
  }
  assert.equal(
    (await request('', 'POST', { medicineId: medicineIds[0], quantity: 1 }))
      .status,
    400,
  );
  assert.equal(
    (await request('', 'POST', record({ medicineId: randomUUID() }))).status,
    404,
  );
  assert.equal(
    await owner.medicationInventory.count({
      where: { patientId: patients[0] },
    }),
    0,
  );
  assert.equal(
    await owner.auditLog.count({ where: { actorId: patients[0] } }),
    0,
  );
});
test('existing non-active catalog identities remain recordable with their explicit medicine status', async () => {
  const row = await create({ medicineId: medicineIds[2] });
  assert.equal(row.medicine.status, 'ARCHIVED');
  assert.equal((await request('')).body.data[0].medicine.status, 'ARCHIVED');
});
test('patch supports explicit null clearing, preserves omitted fields and audits the update', async () => {
  const row = await create({
    expiryDate: '2028-02-29',
    notes: 'Synthetic note',
    batchNumber: 'BATCH',
    lowStockThreshold: 10,
  });
  const changed = await request(`/${row.id}`, 'PATCH', {
    quantity: 9.001,
    expiryDate: null,
    notes: null,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.quantity, '9.001');
  assert.equal(changed.body.data.isLowStock, true);
  assert.equal(changed.body.data.expiryDate, null);
  assert.equal(changed.body.data.notes, null);
  assert.equal(changed.body.data.batchNumber, 'BATCH');
  assert.equal(
    await owner.auditLog.count({
      where: { resourceId: row.id, action: 'INVENTORY_UPDATED' },
    }),
    1,
  );
});
test('patch cannot replace the medicine or ownership, restore archives, or submit an empty edit', async () => {
  const row = await create();
  for (const body of [
    {},
    { medicineId: medicineIds[1] },
    { patientId: patients[1] },
    { archivedAt: null },
    { id: randomUUID() },
    { quantity: 0.0001 },
  ]) {
    assert.equal((await request(`/${row.id}`, 'PATCH', body)).status, 400);
  }
  assert.equal((await request(`/${row.id}`)).body.data.quantity, '30');
});
test('unit changes require an explicit new quantity and threshold confirmation or reset', async () => {
  const row = await create({ lowStockThreshold: 5 });
  for (const body of [
    { unit: 'ML' },
    { unit: 'ML', quantity: 10 },
    { unit: 'ML', lowStockThreshold: null },
  ]) {
    assert.equal((await request(`/${row.id}`, 'PATCH', body)).status, 400);
  }
  const changed = await request(`/${row.id}`, 'PATCH', {
    unit: 'ML',
    quantity: 100.125,
    lowStockThreshold: null,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.quantity, '100.125');
  assert.equal(changed.body.data.unit, 'ML');
  assert.equal(changed.body.data.lowStockThreshold, null);
  assert.equal(
    (await request(`/${row.id}`, 'PATCH', { unit: 'ML', notes: 'Same unit' }))
      .status,
    200,
  );
});
test('low-stock filtering uses each explicit threshold and never combines units or assumes a default', async () => {
  const low = await create({ quantity: 5, lowStockThreshold: 5, unit: 'ML' });
  const zero = await create({ quantity: 0, lowStockThreshold: 0 });
  const high = await create({ quantity: 6, lowStockThreshold: 5 });
  const unknown = await create({ quantity: 0, lowStockThreshold: null });
  const flagged = (await request('?lowStock=true')).body.data;
  assert.deepEqual(flagged.map((r) => r.id).sort(), [low.id, zero.id].sort());
  assert.ok(flagged.every((r) => r.isLowStock));
  assert.deepEqual(
    (await request('?lowStock=false')).body.data.map((r) => r.id).sort(),
    [high.id, unknown.id].sort(),
  );
});
test('expiry uses exact calendar dates, excludes the cutoff and unknown expiry, and sorts nulls last', async () => {
  const earlier = await create({ expiryDate: '2026-09-23' });
  const boundary = await create({ expiryDate: '2026-09-24' });
  const unknown = await create();
  assert.deepEqual(
    (await request('?expiryBefore=2026-09-24')).body.data.map((r) => r.id),
    [earlier.id],
  );
  assert.deepEqual(
    (await request('?sort=expiry_asc')).body.data.map((r) => r.id),
    [earlier.id, boundary.id, unknown.id],
  );
});
test('search, medicine filters, sorting and pagination remain owner-scoped and deterministic', async () => {
  const first = await create({ batchNumber: 'Lot 100%' });
  const second = await create({
    medicineId: medicineIds[1],
    batchNumber: 'Demo_2',
    quantity: 1,
    lowStockThreshold: 1,
  });
  await create({ medicineId: medicineIds[1] }, tokens[1]);
  const all = await request('?limit=1&sort=name_asc');
  assert.deepEqual(all.body.meta, {
    page: 1,
    limit: 1,
    total: 2,
    totalPages: 2,
  });
  assert.equal(all.body.data[0].id, first.id);
  assert.equal(
    (await request('?limit=1&page=2&sort=name_asc')).body.data[0].id,
    second.id,
  );
  assert.equal((await request('?q=B%C3%8ATA')).body.data[0].id, second.id);
  assert.deepEqual(
    (await request('?q=%25')).body.data.map((r) => r.id),
    [first.id],
  );
  assert.deepEqual(
    (await request('?q=_')).body.data.map((r) => r.id),
    [second.id],
  );
  assert.equal(
    (await request(`?medicineId=${medicineIds[0]}&lowStock=true`)).body.meta
      .total,
    0,
  );
  assert.deepEqual((await request('?page=100')).body.data, []);
});
test('archive is idempotent, preserves the row and values, and hides it from current reads and filters', async () => {
  const row = await create({
    quantity: 3.125,
    lowStockThreshold: 5,
    expiryDate: '2026-01-01',
  });
  for (let i = 0; i < 2; i++) {
    const result = await request(`/${row.id}`, 'DELETE');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { data: {}, meta: {} });
  }
  for (const suffix of ['', '?lowStock=true', '?expiryBefore=2027-01-01'])
    assert.equal((await request(suffix)).body.meta.total, 0);
  assert.equal((await request(`/${row.id}`)).status, 404);
  assert.equal(
    (await request(`/${row.id}`, 'PATCH', { quantity: 1 })).status,
    404,
  );
  const persisted = await owner.medicationInventory.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.ok(persisted.archivedAt);
  assert.equal(persisted.quantity.toString(), '3.125');
  assert.equal(persisted.unit, 'CAPSULE');
  assert.equal(
    await owner.auditLog.count({
      where: { resourceId: row.id, action: 'INVENTORY_ARCHIVED' },
    }),
    1,
  );
});
test('concurrent archives from separate sessions produce one archive event', async () => {
  const row = await create();
  const results = await Promise.all([
    request(`/${row.id}`, 'DELETE'),
    request(`/${row.id}`, 'DELETE', undefined, tokens[2]),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  assert.equal(
    await owner.auditLog.count({
      where: { resourceId: row.id, action: 'INVENTORY_ARCHIVED' },
    }),
    1,
  );
});
test('an archive racing an edit cannot resurrect the row or create a post-archive edit', async () => {
  const row = await create();
  const [archived, edited] = await Promise.all([
    request(`/${row.id}`, 'DELETE'),
    request(`/${row.id}`, 'PATCH', { quantity: 1 }, tokens[2]),
  ]);
  assert.equal(archived.status, 200);
  assert.ok([200, 404].includes(edited.status));
  const persisted = await owner.medicationInventory.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.ok(persisted.archivedAt);
  assert.equal(
    persisted.quantity.toString(),
    edited.status === 200 ? '1' : '30',
  );
  assert.equal((await request(`/${row.id}`)).status, 404);
});
test('audit failure rolls back create, patch and archive completely', async () => {
  const row = await create();
  await owner.$executeRaw`REVOKE INSERT ON audit_logs FROM saydaliyati_app`;
  try {
    for (const [path, method, body] of [
      ['', 'POST', record()],
      [`/${row.id}`, 'PATCH', { quantity: 1 }],
      [`/${row.id}`, 'DELETE'],
    ]) {
      const result = await request(path, method, body);
      assert.equal(result.status, 500);
      assert.equal(result.body.error.code, 'PROCESSING_FAILED');
    }
  } finally {
    await owner.$executeRaw`GRANT INSERT ON audit_logs TO saydaliyati_app`;
  }
  assert.equal(
    await owner.medicationInventory.count({
      where: { patientId: patients[0] },
    }),
    1,
  );
  const persisted = await owner.medicationInventory.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.equal(persisted.quantity.toString(), '30');
  assert.equal(persisted.archivedAt, null);
  assert.equal(
    await owner.auditLog.count({ where: { resourceId: row.id } }),
    1,
  );
});
test('runtime role cannot delete inventory or reassign its immutable owner and medicine', async () => {
  const row = await create();
  await assert.rejects(
    runtime.medicationInventory.delete({ where: { id: row.id } }),
  );
  await assert.rejects(
    runtime.medicationInventory.update({
      where: { id: row.id },
      data: { patientId: patients[1] },
    }),
  );
  await assert.rejects(
    runtime.medicationInventory.update({
      where: { id: row.id },
      data: { medicineId: medicineIds[1] },
    }),
  );
  await assert.rejects(
    runtime.medicationInventory.update({
      where: { id: row.id },
      data: { createdAt: new Date() },
    }),
  );
});
test('database constraints reject invalid quantities, thresholds, enum values and foreign keys', async () => {
  const data = {
    patientId: patients[0],
    medicineId: medicineIds[0],
    quantity: 1,
    unit: 'CAPSULE',
  };
  for (const extra of [
    { quantity: -1 },
    { quantity: 'NaN' },
    { quantity: '1000000000' },
    { lowStockThreshold: -1 },
    { lowStockThreshold: 'NaN' },
    { patientId: randomUUID() },
    { medicineId: randomUUID() },
  ]) {
    await assert.rejects(
      owner.medicationInventory.create({ data: { ...data, ...extra } }),
    );
  }
  await assert.rejects(
    owner.$executeRaw`INSERT INTO medication_inventory (patient_id, medicine_id, quantity, unit) VALUES (${patients[0]}::uuid, ${medicineIds[0]}::uuid, 1, 'PILL'::inventory_unit)`,
  );
  const row = await create();
  await assert.rejects(
    owner.medicine.delete({ where: { id: row.medicineId } }),
  );
  await assert.rejects(owner.user.delete({ where: { id: patients[0] } }));
});
test('invalid filters and IDs fail with canonical errors and unknown rows are non-disclosing', async () => {
  for (const path of [
    '?page=0',
    '?limit=101',
    '?lowStock=1',
    '?expiryBefore=2026-02-29',
    '?status=ARCHIVED',
    '?sort=quantity',
    '?q=',
    `?patientId=${patients[1]}`,
    '?page=1&page=2',
    '/invalid',
  ]) {
    const result = await request(path);
    assert.equal(result.status, 400, path);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  }
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    const result = await request(
      `/${randomUUID()}`,
      method,
      method === 'PATCH' ? { quantity: 1 } : undefined,
    );
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, 'RESOURCE_NOT_FOUND');
  }
});
test('revoked sessions and changed account status cannot mutate or read inventory', async () => {
  const row = await create();
  await owner.session.update({
    where: { id: sessions[0] },
    data: { revokedAt: new Date() },
  });
  assert.equal((await request('')).status, 401);
  assert.equal((await request('', 'POST', record())).status, 401);
  await owner.user.update({
    where: { id: patients[0] },
    data: { status: 'DISABLED' },
  });
  assert.equal(
    (await request(`/${row.id}`, 'PATCH', { quantity: 1 }, tokens[2])).status,
    403,
  );
  assert.equal(
    (await request(`/${row.id}`, 'DELETE', undefined, tokens[2])).status,
    403,
  );
});
