import { Buffer, Blob } from 'node:buffer';
const { FormData } = globalThis;
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { Redis } from 'ioredis';
import sharp from 'sharp';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
import { TokensService } from '../dist/auth/tokens.service.js';
import { DocumentStorage } from '../dist/documents/storage.service.js';

for (const key of ['TEST_DATABASE_URL', 'TEST_RUNTIME_DATABASE_URL']) {
  const url = new URL(process.env[key]);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/saydaliyati_test');
}
const endpoint = new URL(process.env['DOCUMENT_STORAGE_ENDPOINT']);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname));
const redisUrl = new URL(process.env['TEST_REDIS_URL']);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(redisUrl.hostname));
assert.equal(redisUrl.pathname, '/1');
const config = readConfig({
  NODE_ENV: 'test',
  AUTH_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: process.env['TEST_RUNTIME_DATABASE_URL'],
  REDIS_URL: redisUrl.href,
  DOCUMENT_STORAGE_ENDPOINT: endpoint.href,
  DOCUMENT_STORAGE_BUCKET: 'saydaliyati-documents-test',
  DOCUMENT_STORAGE_ACCESS_KEY: process.env['DOCUMENT_STORAGE_ACCESS_KEY'],
  DOCUMENT_STORAGE_SECRET_KEY: process.env['DOCUMENT_STORAGE_SECRET_KEY'],
});
const owner = createDatabaseClient(process.env['TEST_DATABASE_URL']);
const runtime = createDatabaseClient(process.env['TEST_RUNTIME_DATABASE_URL']);
const storage = new DocumentStorage(config),
  signer = new TokensService(config),
  redis = new Redis(redisUrl.href);
const users = [randomUUID(), randomUUID()],
  sessions = [randomUUID(), randomUUID(), randomUUID()],
  tokens = [];
let app, base, png;
async function request(path, method = 'GET', body, token = tokens[0]) {
  const response = await fetch(`${base}/api/v1/me/prescriptions${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}
async function draft(token = tokens[0]) {
  const result = await request(
    '',
    'POST',
    { medications: [{ extractedName: 'Synthetic document test' }] },
    token,
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.data.id;
}
async function upload(
  id,
  page = 1,
  token = tokens[0],
  bytes = png,
  type = 'image/png',
  extra,
) {
  const form = new FormData();
  form.set('pageNumber', String(page));
  form.set('file', new Blob([bytes], { type }), '../../untrusted-name.png');
  if (extra) form.set('patientId', users[1]);
  return request(`/${id}/documents`, 'POST', form, token);
}
const download = (id, doc, token = tokens[0]) =>
  request(`/${id}/documents/${doc}/download`, 'GET', undefined, token);
async function objectKeys() {
  const result = await storage
    .requireConfigured()
    .send(new ListObjectsV2Command({ Bucket: config.DOCUMENT_STORAGE_BUCKET }));
  assert.ok(!result.IsTruncated);
  return (result.Contents ?? []).map((x) => x.Key).sort();
}
async function cleanup() {
  const docs = await owner.prescriptionDocument.findMany({
    where: { patientId: { in: users } },
  });
  for (const doc of docs) await storage.remove(doc.storageKey);
  const rows = await owner.prescription.findMany({
    where: { patientId: { in: users } },
    select: { id: true },
  });
  const ids = rows.map((x) => x.id);
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
  png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  for (const id of users)
    await owner.user.create({ data: { id, email: `${id}@example.test` } });
  const expiresAt = new Date(Date.now() + 3600000);
  for (const [index, id] of sessions.entries()) {
    const userId = index === 1 ? users[1] : users[0];
    await owner.session.create({
      data: { id, userId, refreshTokenHash: 'synthetic', expiresAt },
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
  } finally {
    await app?.close();
    await owner.$disconnect();
    await runtime.$disconnect();
    redis.disconnect();
    storage.onModuleDestroy();
  }
});
test('private uploads preserve original bytes, expose safe metadata and issue audited 60-second links', async () => {
  const id = await draft(),
    result = await upload(id);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const doc = result.body.data;
  assert.deepEqual(Object.keys(doc).sort(), [
    'id',
    'mimeType',
    'pageNumber',
    'processingStatus',
  ]);
  assert.equal(doc.processingStatus, 'UPLOADED');
  const detail = (await request(`/${id}`)).body.data;
  assert.equal(detail.source, 'MANUAL');
  assert.equal(detail.processingStatus, null);
  assert.deepEqual(detail.documents, [doc]);
  const link = await download(id, doc.id);
  assert.equal(link.status, 200, JSON.stringify(link.body));
  assert.equal(link.headers.get('cache-control'), 'no-store');
  const url = new URL(link.body.data.url);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
  assert.ok(new Date(link.body.data.expiresAt).getTime() <= Date.now() + 60000);
  const bytes = await fetch(url);
  assert.equal(bytes.status, 200);
  assert.equal(bytes.headers.get('cache-control'), 'no-store');
  assert.match(bytes.headers.get('content-disposition'), /^attachment;/);
  assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), png);
  const tampered = new URL(url);
  tampered.searchParams.set('X-Amz-Expires', '3600');
  assert.equal((await fetch(tampered)).status, 403);
  const unsigned = new URL(url);
  unsigned.search = '';
  assert.equal((await fetch(unsigned)).status, 403);
  const logs = await owner.auditLog.findMany({ where: { resourceId: doc.id } });
  assert.deepEqual(logs.map((x) => x.action).sort(), [
    'DOCUMENT_DOWNLOAD_ISSUED',
    'DOCUMENT_UPLOADED',
  ]);
  assert.ok(!JSON.stringify(logs).includes(url.href));
});
test('documents are owner-only, tied to their parent, and unavailable after soft deletion or retention expiry', async () => {
  const id = await draft(),
    other = await draft(tokens[1]),
    doc = (await upload(id)).body.data;
  assert.equal((await upload(id, 2, tokens[1])).status, 404);
  assert.equal((await download(id, doc.id, tokens[1])).status, 404);
  assert.equal((await download(other, doc.id, tokens[1])).status, 404);
  assert.equal((await download(id, doc.id, null)).status, 401);
  await owner.prescriptionDocument.update({
    where: { id: doc.id },
    data: { retentionUntil: new Date(Date.now() + 15000) },
  });
  const link = await download(id, doc.id);
  assert.equal(link.status, 200);
  assert.ok(
    Number(new URL(link.body.data.url).searchParams.get('X-Amz-Expires')) <= 15,
  );
  await owner.prescriptionDocument.update({
    where: { id: doc.id },
    data: { retentionUntil: new Date(Date.now() - 1000) },
  });
  assert.equal((await download(id, doc.id)).status, 404);
  await owner.prescriptionDocument.update({
    where: { id: doc.id },
    data: { retentionUntil: null, deletedAt: new Date() },
  });
  assert.equal((await download(id, doc.id)).status, 404);
});
test('concurrent same-page uploads commit exactly once and enforce consecutive bounded order', async () => {
  const id = await draft();
  assert.equal((await upload(id, 2)).status, 409);
  const results = await Promise.all([upload(id, 1), upload(id, 1, tokens[2])]);
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 409]);
  assert.equal((await upload(id, 2)).status, 201);
  assert.equal((await upload(id, 21)).status, 400);
  assert.equal(
    await owner.prescriptionDocument.count({ where: { prescriptionId: id } }),
    2,
  );
});
test('uploads reject MIME spoofing, truncated images, excess fields and size before persistence', async () => {
  const id = await draft();
  assert.equal((await upload(id, 1, tokens[0], png, 'image/jpeg')).status, 415);
  for (const result of [
    await upload(id, 1, tokens[0], png.subarray(0, 40)),
    await upload(id, 1, tokens[0], png, 'image/png', true),
  ])
    assert.equal(result.status, 400, JSON.stringify(result.body));
  const tooLarge = await upload(
    id,
    1,
    tokens[0],
    Buffer.alloc(5 * 1024 * 1024 + 1),
  );
  assert.equal(tooLarge.status, 413, JSON.stringify(tooLarge.body));
  assert.equal(
    await owner.prescriptionDocument.count({ where: { prescriptionId: id } }),
    0,
  );
  assert.equal((await upload(id)).status, 201); // Capacity is released after failures.
});
test('archived drafts keep owner downloads but reject uploads; professional role has no bypass', async () => {
  const id = await draft(),
    doc = (await upload(id)).body.data;
  await request(`/${id}`, 'DELETE');
  assert.equal((await upload(id, 2)).status, 409);
  assert.equal((await download(id, doc.id)).status, 200);
  await owner.user.update({
    where: { id: users[0] },
    data: { role: 'DOCTOR' },
  });
  assert.equal((await upload(id, 2)).status, 403);
  assert.equal((await download(id, doc.id)).status, 403);
});
test('failed transactional audit rolls back metadata and cleans uploaded bytes; no link is returned', async () => {
  const id = await draft(),
    doc = (await upload(id)).body.data,
    beforeKeys = await objectKeys();
  await owner.$executeRawUnsafe(
    'REVOKE INSERT ON audit_logs FROM saydaliyati_app',
  );
  try {
    assert.equal((await upload(id, 2)).status, 500);
    const link = await download(id, doc.id);
    assert.equal(link.status, 500);
    assert.ok(!JSON.stringify(link.body).includes('X-Amz-'));
  } finally {
    await owner.$executeRawUnsafe(
      'GRANT INSERT ON audit_logs TO saydaliyati_app',
    );
  }
  assert.equal(
    await owner.prescriptionDocument.count({ where: { prescriptionId: id } }),
    1,
  );
  assert.deepEqual(await objectKeys(), beforeKeys);
});
test('missing object fails closed without a signed URL and runtime cannot rewrite document identity or delete rows', async () => {
  const id = await draft(),
    doc = (await upload(id)).body.data;
  const row = await owner.prescriptionDocument.findUniqueOrThrow({
    where: { id: doc.id },
  });
  await storage.remove(row.storageKey);
  const link = await download(id, doc.id);
  assert.equal(link.status, 503);
  assert.ok(!JSON.stringify(link.body).includes(row.storageKey));
  for (const data of [
    { patientId: users[1] },
    { storageKey: 'rewritten' },
    { pageNumber: 2 },
    { deletedAt: new Date() },
  ])
    await assert.rejects(
      runtime.prescriptionDocument.update({ where: { id: doc.id }, data }),
    );
  await assert.rejects(
    runtime.prescriptionDocument.delete({ where: { id: doc.id } }),
  );
});

test('unavailable object storage returns safe errors without creating metadata or exposing URLs', async () => {
  const id = await draft(),
    doc = (await upload(id)).body.data;
  const unavailable = await createApplication({
    ...config,
    DOCUMENT_STORAGE_ENDPOINT: 'http://127.0.0.1:1',
  });
  await unavailable.listen(0, '127.0.0.1');
  const originalBase = base;
  try {
    base = await unavailable.getUrl();
    const result = await upload(id, 2);
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'SERVICE_UNAVAILABLE');
    assert.equal((await download(id, doc.id)).status, 503);
    assert.equal(
      await owner.prescriptionDocument.count({ where: { prescriptionId: id } }),
      1,
    );
  } finally {
    base = originalBase;
    await unavailable.close();
  }
});
