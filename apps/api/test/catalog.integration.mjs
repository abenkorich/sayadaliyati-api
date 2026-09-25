import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
import { TokensService } from '../dist/auth/tokens.service.js';

for (const value of [
  process.env['TEST_DATABASE_URL'],
  process.env['TEST_RUNTIME_DATABASE_URL'],
]) {
  assert.ok(value, 'Use root integration-test command');
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/saydaliyati_test');
}
const owner = createDatabaseClient(process.env['TEST_DATABASE_URL']);
const runtime = createDatabaseClient(process.env['TEST_RUNTIME_DATABASE_URL']);
const config = readConfig({
  NODE_ENV: 'test',
  AUTH_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: process.env['TEST_RUNTIME_DATABASE_URL'],
  REDIS_URL: process.env['TEST_REDIS_URL'],
});
const namespace = randomUUID();
const manufacturerId = randomUUID(),
  ingredientId = randomUUID(),
  userId = randomUUID(),
  sessionId = randomUUID();
const ids = Array.from({ length: 5 }, () => randomUUID());
const barcode = `00${randomBytes(12).toString('hex')}`;
let app, base, token;
async function get(path, access = token) {
  const response = await fetch(`${base}/api/v1/medicines${path}`, {
    headers: access ? { authorization: `Bearer ${access}` } : {},
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  await owner.manufacturer.create({
    data: {
      id: manufacturerId,
      name: `DEMO ${namespace}`,
      normalizedName: `demo ${namespace}`,
    },
  });
  await owner.activeIngredient.create({
    data: {
      id: ingredientId,
      name: `Ingredient ${namespace}`,
      normalizedName: `ingredient ${namespace}`,
    },
  });
  const names = [
    `Alpha ${namespace}`,
    `Alpha ${namespace}`,
    `DÉMO bêta ${namespace}`,
    `Archived ${namespace}`,
    `Inactive ${namespace}`,
  ];
  for (let i = 0; i < ids.length; i++) {
    await owner.medicine.create({
      data: {
        id: ids[i],
        name: names[i],
        normalizedName: names[i].toLowerCase(),
        manufacturerId,
        status: i === 3 ? 'ARCHIVED' : i === 4 ? 'INACTIVE' : 'ACTIVE',
        brandName: i === 2 ? `علامة ${namespace}` : null,
        genericName: i === 1 ? `Generic ${namespace}` : null,
        source: 'SYNTHETIC_TEST_FIXTURE',
        sourceVersion: '1',
        ingredients: {
          create: {
            ingredientId,
            amount: i === 0 ? '12.3456' : null,
            unit: i === 0 ? 'demo-unit' : null,
          },
        },
        barcodes: {
          create: {
            barcode: i === 0 ? barcode : `${namespace}-${i}`,
            barcodeType: 'OTHER',
          },
        },
        ...(i === 0
          ? {
              images: {
                create: [
                  {
                    url: 'https://example.test/demo-back.png',
                    imageType: 'BACK',
                    sortOrder: 1,
                  },
                  {
                    url: 'https://example.test/demo-front.png',
                    imageType: 'FRONT',
                    sortOrder: 0,
                  },
                ],
              },
            }
          : {}),
      },
    });
  }
  await owner.user.create({
    data: { id: userId, email: `${namespace}@example.test` },
  });
  const expiresAt = new Date(Date.now() + 3600000);
  await owner.session.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash: 'synthetic-test-hash',
      expiresAt,
    },
  });
  token = await new TokensService(config).access(userId, sessionId, expiresAt);
  app = await createApplication(config);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  try {
    await owner.medicineImage.deleteMany({
      where: { medicineId: { in: ids } },
    });
    await owner.medicineBarcode.deleteMany({
      where: { medicineId: { in: ids } },
    });
    await owner.medicineIngredient.deleteMany({
      where: { medicineId: { in: ids } },
    });
    await owner.medicine.deleteMany({ where: { id: { in: ids } } });
    await owner.activeIngredient.deleteMany({ where: { id: ingredientId } });
    await owner.manufacturer.deleteMany({ where: { id: manufacturerId } });
    await owner.session.deleteMany({ where: { userId } });
    await owner.user.deleteMany({ where: { id: userId } });
  } finally {
    await app?.close();
    await owner.$disconnect();
    await runtime.$disconnect();
  }
});

test('catalog routes require an authenticated session', async () => {
  for (const path of ['', `/${ids[0]}`, `/barcode/${barcode}`]) {
    const result = await get(path, null);
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'AUTH_REQUIRED');
  }
});
test('browse defaults to ACTIVE, has deterministic pagination and a matching total', async () => {
  const first = await get(`?manufacturer=${manufacturerId}&limit=1`);
  const second = await get(`?manufacturer=${manufacturerId}&limit=1&page=2`);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.meta, {
    page: 1,
    limit: 1,
    total: 3,
    totalPages: 3,
  });
  assert.deepEqual(
    [first.body.data[0].id, second.body.data[0].id],
    ids.slice(0, 2).sort(),
  );
  assert.equal(first.body.data[0].status, 'ACTIVE');
  const beyond = await get(`?manufacturer=${manufacturerId}&page=5`);
  assert.deepEqual(beyond.body.data, []);
  assert.equal(beyond.body.meta.total, 3);
});
test('search matches literal name, generic, brand and ingredient across languages', async () => {
  for (const [q, count] of [
    [`ALPHA ${namespace}`, 2],
    [`Generic ${namespace}`, 1],
    [` DE\u0301MO   BÊTA ${namespace} `, 1],
    [`علامة ${namespace}`, 1],
    [`Ingredient ${namespace}`, 3],
  ]) {
    const result = await get(`?q=${encodeURIComponent(q)}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.meta.total, count, q);
  }
});
test('search escapes SQL LIKE wildcards and treats SQL-shaped text as data', async () => {
  for (const q of ['%', '_', '\\', "' OR 1=1 --"]) {
    const result = await get(
      `?manufacturer=${manufacturerId}&q=${encodeURIComponent(q)}`,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.meta.total, 0);
  }
});
test('ingredient and manufacturer filters intersect, and status is explicit', async () => {
  const match = await get(
    `?manufacturer=${manufacturerId}&ingredient=${ingredientId}&status=ARCHIVED`,
  );
  assert.deepEqual(
    match.body.data.map((m) => m.id),
    [ids[3]],
  );
  const none = await get(
    `?manufacturer=${manufacturerId}&ingredient=${randomUUID()}`,
  );
  assert.deepEqual(none.body.meta, {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const inactive = await get(`?manufacturer=${manufacturerId}&status=INACTIVE`);
  assert.equal(inactive.body.data[0].id, ids[4]);
});
test('detail projects canonical fields, exact decimal values, ordered images and provenance', async () => {
  const result = await get(`/${ids[0]}`);
  assert.equal(result.status, 200);
  const row = result.body.data;
  assert.equal(row.ingredients[0].amount, '12.3456');
  assert.equal(row.ingredients[0].unit, 'demo-unit');
  assert.deepEqual(
    row.images.map((image) => image.imageType),
    ['FRONT', 'BACK'],
  );
  assert.equal(row.source, 'SYNTHETIC_TEST_FIXTURE');
  assert.equal(row.normalizedName, undefined);
  assert.equal(row.createdAt, undefined);
  assert.deepEqual(row.manufacturer, {
    id: manufacturerId,
    name: `DEMO ${namespace}`,
  });
  assert.equal((await get(`/${ids[1]}`)).body.data.ingredients[0].amount, null);
});
test('barcode lookup is exact, preserves zeros, trims outer whitespace and returns canonical detail', async () => {
  const detail = await get(`/${ids[0]}`);
  const result = await get(`/barcode/${encodeURIComponent(` ${barcode} `)}`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, detail.body);
  assert.equal((await get(`/barcode/${barcode.slice(2)}`)).status, 404);
  assert.equal((await get(`/barcode/${barcode.toUpperCase()}`)).status, 404);
});
test('inactive and archived identities remain readable with their status, with no mutation', async () => {
  assert.equal((await get(`/${ids[3]}`)).body.data.status, 'ARCHIVED');
  assert.equal(
    (await get(`/barcode/${namespace}-4`)).body.data.status,
    'INACTIVE',
  );
  const mutation = await fetch(`${base}/api/v1/medicines`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(mutation.status, 404);
});
test('invalid and unknown identities yield safe canonical errors', async () => {
  for (const path of [
    '?limit=0',
    '?limit=101',
    '?page=1&page=2',
    '?q=',
    '?q=null%00byte',
    '?unknown=value',
    '?manufacturer=not-uuid',
    '/not-uuid',
    `/barcode/${'x'.repeat(101)}`,
  ]) {
    const result = await get(path);
    assert.equal(result.status, 400, path);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  }
  for (const path of [`/${randomUUID()}`, '/barcode/UNKNOWN-DEMO-BARCODE']) {
    const result = await get(path);
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, 'RESOURCE_NOT_FOUND');
  }
});
test('catalog persistence rejects duplicate/unnormalized barcodes, bad references and negative image order', async () => {
  await assert.rejects(
    owner.medicineBarcode.create({
      data: { medicineId: ids[1], barcode, barcodeType: 'OTHER' },
    }),
  );
  await assert.rejects(
    owner.medicineBarcode.create({
      data: { medicineId: ids[1], barcode: ' trailing ', barcodeType: 'OTHER' },
    }),
  );
  await assert.rejects(
    owner.medicineBarcode.create({
      data: {
        medicineId: randomUUID(),
        barcode: namespace,
        barcodeType: 'OTHER',
      },
    }),
  );
  await assert.rejects(
    owner.medicineImage.create({
      data: {
        medicineId: ids[0],
        url: 'https://example.test/demo.png',
        imageType: 'OTHER',
        sortOrder: -1,
      },
    }),
  );
  await assert.rejects(
    owner.medicineImage.create({
      data: {
        medicineId: ids[0],
        url: 'javascript:alert(1)',
        imageType: 'OTHER',
      },
    }),
  );
  await assert.rejects(
    owner.manufacturer.delete({ where: { id: manufacturerId } }),
  );
});
test('application database role reads catalog but cannot create, edit or delete master records', async () => {
  assert.equal(
    (await runtime.medicine.findUnique({ where: { id: ids[0] } })).id,
    ids[0],
  );
  await assert.rejects(
    runtime.medicine.create({
      data: { name: 'Denied', normalizedName: 'denied' },
    }),
  );
  await assert.rejects(
    runtime.medicine.update({
      where: { id: ids[0] },
      data: { status: 'ARCHIVED' },
    }),
  );
  await assert.rejects(runtime.medicine.delete({ where: { id: ids[0] } }));
  await assert.rejects(
    runtime.medicineBarcode.create({
      data: { medicineId: ids[0], barcode: namespace, barcodeType: 'OTHER' },
    }),
  );
});
test('all supported roles can read catalog identities', async () => {
  for (const role of ['PATIENT', 'DOCTOR', 'PHARMACY', 'ADMIN']) {
    await owner.user.update({ where: { id: userId }, data: { role } });
    assert.equal((await get(`/${ids[0]}`)).status, 200);
  }
});
test('account status changes block catalog access with existing tokens', async () => {
  for (const status of ['DISABLED', 'SUSPENDED', 'PENDING_VERIFICATION']) {
    await owner.user.update({ where: { id: userId }, data: { status } });
    assert.equal((await get(`/${ids[0]}`)).status, 403);
  }
  await owner.user.update({
    where: { id: userId },
    data: { status: 'ACTIVE' },
  });
});
test('session revocation blocks catalog access immediately', async () => {
  await owner.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  const result = await get('');
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, 'AUTH_SESSION_REVOKED');
});
