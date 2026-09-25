import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { Redis } from 'ioredis';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
import { TokensService } from '../dist/auth/tokens.service.js';
for (const name of ['TEST_DATABASE_URL', 'TEST_RUNTIME_DATABASE_URL']) {
  const url = new URL(process.env[name]);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/saydaliyati_test');
}
const redisUrl = new URL(process.env['TEST_REDIS_URL']);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(redisUrl.hostname));
assert.equal(redisUrl.pathname, '/1');
const owner = createDatabaseClient(process.env['TEST_DATABASE_URL']),
  runtime = createDatabaseClient(process.env['TEST_RUNTIME_DATABASE_URL']);
const config = readConfig({
  NODE_ENV: 'test',
  AUTH_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: process.env['TEST_RUNTIME_DATABASE_URL'],
  REDIS_URL: redisUrl.href,
});
const signer = new TokensService(config),
  redis = new Redis(redisUrl.href);
const users = [randomUUID(), randomUUID()],
  sessions = [randomUUID(), randomUUID(), randomUUID()],
  tokens = [];
const flags = {
  doseReminders: false,
  expiryReminders: false,
  lowStockAlerts: false,
  sharingNotifications: false,
  systemNotifications: false,
};
let app, base;
async function request(method = 'GET', body, token = tokens[0], path = '') {
  const response = await fetch(
    `${base}/api/v1/me/notification-preferences${path}`,
    {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  );
  return { status: response.status, body: await response.json() };
}
async function cleanup() {
  await owner.notificationPreferences.deleteMany({
    where: { userId: { in: users } },
  });
  await owner.auditLog.deleteMany({ where: { actorId: { in: users } } });
}
before(async () => {
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
  await owner.session.updateMany({
    where: { id: { in: sessions } },
    data: { revokedAt: null },
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
  }
});
test('unconfigured reads are side-effect free and first save requires every flag', async () => {
  assert.deepEqual((await request()).body, {
    data: { configured: false, preferences: null },
    meta: {},
  });
  for (const body of [
    { doseReminders: true },
    { expiryLeadDays: 5 },
    { ...flags, systemNotifications: undefined },
  ])
    assert.equal((await request('PATCH', body)).status, 400);
  assert.equal(
    await owner.notificationPreferences.count({ where: { userId: users[0] } }),
    0,
  );
  assert.equal(await owner.auditLog.count({ where: { actorId: users[0] } }), 0);
  const result = await request('PATCH', flags);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body, {
    data: { configured: true, preferences: { ...flags, expiryLeadDays: null } },
    meta: {},
  });
  assert.deepEqual((await request()).body, result.body);
});
test('partial updates preserve other flags, distinguish null/zero, and repeated values do not duplicate audit', async () => {
  await request('PATCH', { ...flags, doseReminders: true, expiryLeadDays: 10 });
  const result = await request('PATCH', {
    expiryReminders: true,
    expiryLeadDays: 0,
  });
  assert.deepEqual(result.body.data.preferences, {
    ...flags,
    doseReminders: true,
    expiryReminders: true,
    expiryLeadDays: 0,
  });
  await request('PATCH', { expiryLeadDays: null });
  const before = await owner.notificationPreferences.findUniqueOrThrow({
    where: { userId: users[0] },
  });
  await request('PATCH', { expiryLeadDays: null });
  const after = await owner.notificationPreferences.findUniqueOrThrow({
    where: { userId: users[0] },
  });
  assert.deepEqual(after.updatedAt, before.updatedAt);
  const logs = await owner.auditLog.findMany({ where: { actorId: users[0] } });
  assert.equal(logs.length, 3);
  assert.ok(
    logs.every(
      (log) =>
        Object.keys(log.metadata).sort().join(',') === 'requestId,result',
    ),
  );
});
test('authentication and owner isolation hold for every active account role', async () => {
  assert.equal((await request('GET', undefined, null)).status, 401);
  assert.equal((await request('PATCH', flags, null)).status, 401);
  for (const role of ['PATIENT', 'DOCTOR', 'PHARMACY', 'ADMIN']) {
    await owner.user.update({ where: { id: users[0] }, data: { role } });
    assert.equal(
      (await request('PATCH', { ...flags, expiryLeadDays: 4 })).status,
      200,
    );
    assert.equal((await request()).body.data.configured, true);
    assert.deepEqual((await request('GET', undefined, tokens[1])).body.data, {
      configured: false,
      preferences: null,
    });
  }
  assert.equal(
    (await request('PATCH', { ...flags, userId: users[1] })).status,
    400,
  );
  assert.equal(
    (await request('GET', undefined, tokens[0], `/${users[1]}`)).status,
    404,
  );
  await owner.session.update({
    where: { id: sessions[0] },
    data: { revokedAt: new Date() },
  });
  assert.equal((await request('PATCH', { doseReminders: true })).status, 401);
});
test('disabled and suspended accounts cannot read or alter settings', async () => {
  await request('PATCH', flags);
  for (const status of ['DISABLED', 'SUSPENDED', 'PENDING_VERIFICATION']) {
    await owner.user.update({ where: { id: users[0] }, data: { status } });
    assert.equal((await request()).status, 403);
    assert.equal((await request('PATCH', { doseReminders: true })).status, 403);
  }
  assert.equal(
    (
      await owner.notificationPreferences.findUniqueOrThrow({
        where: { userId: users[0] },
      })
    ).doseReminders,
    false,
  );
});
test('concurrent first saves are serialized and independent partial edits are preserved across sessions', async () => {
  const first = await Promise.all([
    request('PATCH', flags),
    request('PATCH', flags, tokens[2]),
  ]);
  assert.deepEqual(
    first.map((x) => x.status),
    [200, 200],
  );
  assert.equal(
    await owner.notificationPreferences.count({ where: { userId: users[0] } }),
    1,
  );
  assert.equal(await owner.auditLog.count({ where: { actorId: users[0] } }), 1);
  const partial = await Promise.all([
    request('PATCH', { doseReminders: true }),
    request('PATCH', { lowStockAlerts: true }, tokens[2]),
  ]);
  assert.deepEqual(
    partial.map((x) => x.status),
    [200, 200],
  );
  assert.deepEqual((await request()).body.data.preferences, {
    ...flags,
    doseReminders: true,
    lowStockAlerts: true,
    expiryLeadDays: null,
  });
});
test('audit failure rolls back initial and subsequent settings writes', async () => {
  await owner.$executeRawUnsafe(
    'REVOKE INSERT ON audit_logs FROM saydaliyati_app',
  );
  try {
    assert.equal((await request('PATCH', flags)).status, 500);
  } finally {
    await owner.$executeRawUnsafe(
      'GRANT INSERT ON audit_logs TO saydaliyati_app',
    );
  }
  assert.equal((await request()).body.data.configured, false);
  await request('PATCH', flags);
  await owner.$executeRawUnsafe(
    'REVOKE INSERT ON audit_logs FROM saydaliyati_app',
  );
  try {
    assert.equal((await request('PATCH', { doseReminders: true })).status, 500);
  } finally {
    await owner.$executeRawUnsafe(
      'GRANT INSERT ON audit_logs TO saydaliyati_app',
    );
  }
  assert.equal((await request()).body.data.preferences.doseReminders, false);
});
test('database bounds and runtime privileges protect owners, history and explicit initial consent', async () => {
  await request('PATCH', flags);
  for (const data of [{ userId: users[1] }, { createdAt: new Date(0) }])
    await assert.rejects(
      runtime.notificationPreferences.update({
        where: { userId: users[0] },
        data,
      }),
    );
  await assert.rejects(
    runtime.notificationPreferences.delete({ where: { userId: users[0] } }),
  );
  await assert.rejects(
    owner.notificationPreferences.update({
      where: { userId: users[0] },
      data: { expiryLeadDays: -1 },
    }),
  );
  await assert.rejects(
    owner.$executeRaw`INSERT INTO notification_preferences (user_id) VALUES (${users[1]}::uuid)`,
  );
  for (const expiryLeadDays of [-1, 0.5, '1', 2147483648])
    assert.equal((await request('PATCH', { expiryLeadDays })).status, 400);
  assert.equal(
    (await request('PATCH', { expiryLeadDays: 2147483647 })).status,
    200,
  );
});
