import { spawnSync } from 'node:child_process';
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
let app, base;
async function request(method = 'GET', body, token = tokens[0], path = '') {
  const response = await fetch(`${base}/api/v1/admin${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
async function cleanup() {
  await owner.adminDirectoryEntry.deleteMany({
    where: { name: { startsWith: users[0] } },
  });
  await owner.medicine.deleteMany({ where: { source: users[0] } });
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

test('admin endpoints enforce roles, validation, session revocation and scoped fields', async () => {
  for (const path of [
    '/overview',
    '/users',
    '/medicines',
    '/directory/doctors',
    '/directory/pharmacies',
    '/directory/hospitals',
    '/settings',
  ]) {
    assert.equal((await request('GET', undefined, null, path)).status, 401);
    for (const role of ['PATIENT', 'DOCTOR', 'PHARMACY']) {
      await owner.user.update({ where: { id: users[0] }, data: { role } });
      assert.equal(
        (await request('GET', undefined, tokens[0], path)).status,
        403,
      );
    }
  }
  await owner.user.update({ where: { id: users[0] }, data: { role: 'ADMIN' } });
  assert.equal(
    (await request('GET', undefined, tokens[0], '/overview')).status,
    200,
  );
  const listed = await request('GET', undefined, tokens[0], '/users');
  assert.equal(listed.status, 200);
  for (const row of listed.body.data) {
    assert.equal('passwordHash' in row, false);
    assert.equal('patientProfile' in row, false);
  }
  assert.equal(
    (
      await request(
        'PATCH',
        { status: 'DISABLED' },
        tokens[0],
        `/users/${users[0]}`,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        'PATCH',
        { status: 'ACTIVE', role: 'ADMIN' },
        tokens[0],
        `/users/${users[1]}`,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        'PATCH',
        { status: 'SUSPENDED' },
        tokens[0],
        `/users/${users[1]}`,
      )
    ).status,
    200,
  );
  assert.ok(
    (await owner.session.findUnique({ where: { id: sessions[1] } })).revokedAt,
  );
  assert.equal(
    (await request('GET', undefined, tokens[1], '/overview')).status,
    401,
  );
  assert.equal(
    (await request('GET', undefined, tokens[0], '/users?page=0')).status,
    400,
  );
});
test('runtime role persists directories and catalog updates with transactional audits', async () => {
  await owner.user.update({ where: { id: users[0] }, data: { role: 'ADMIN' } });
  const input = {
    name: users[0] + ' test contact',
    specialty: null,
    licenseNumber: null,
    address: null,
    city: 'Algiers',
    phone: null,
    email: null,
    status: 'DRAFT',
  };
  for (const kind of ['doctors', 'pharmacies', 'hospitals']) {
    const created = await request(
      'POST',
      input,
      tokens[0],
      `/directory/${kind}`,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const saved = await request(
      'PATCH',
      { ...input, status: 'ACTIVE' },
      tokens[0],
      `/directory/${kind}/${id}`,
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(
      (
        await request(
          'GET',
          undefined,
          tokens[0],
          `/directory/${kind}?q=${users[0]}`,
        )
      ).body.meta.total,
      1,
    );
    const other = kind === 'doctors' ? 'hospitals' : 'doctors';
    assert.equal(
      (await request('PATCH', input, tokens[0], `/directory/${other}/${id}`))
        .status,
      404,
    );
  }
  const medicine = {
    name: users[0] + ' synthetic test medicine',
    genericName: null,
    strength: null,
    dosageForm: null,
    status: 'INACTIVE',
    source: users[0],
  };
  const created = await request('POST', medicine, tokens[0], '/medicines');
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const updated = await request(
    'PATCH',
    { ...medicine, status: 'ARCHIVED' },
    tokens[0],
    '/medicines/' + created.body.data.id,
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.status, 'ARCHIVED');
  assert.equal(
    await owner.auditLog.count({
      where: { actorId: users[0], action: { startsWith: 'ADMIN_' } },
    }),
    8,
  );
});
test('settings validate and save using runtime database privileges', async () => {
  await owner.user.update({ where: { id: users[0] }, data: { role: 'ADMIN' } });
  const existing = await owner.adminSettings.findUnique({
    where: { id: 'platform' },
  });
  try {
    const input = {
      organizationName: 'Synthetic test organization',
      supportEmail: 'support@example.test',
      defaultLanguage: 'FR',
      timezone: 'Africa/Algiers',
    };
    assert.equal(
      (
        await request(
          'PATCH',
          { ...input, timezone: 'Invalid' },
          tokens[0],
          '/settings',
        )
      ).status,
      400,
    );
    const result = await request('PATCH', input, tokens[0], '/settings');
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(
      (await request('GET', undefined, tokens[0], '/settings')).body.data
        .organizationName,
      input.organizationName,
    );
  } finally {
    if (existing)
      await owner.adminSettings.update({
        where: { id: 'platform' },
        data: existing,
      });
    else await owner.adminSettings.deleteMany({ where: { id: 'platform' } });
  }
});

test('admin bootstrap hashes environment credentials, is idempotent and refuses privilege promotion', async () => {
  const email = `${randomUUID()}@example.test`,
    password = randomBytes(24).toString('base64url');
  const run = (address) =>
    spawnSync(process.execPath, ['scripts/bootstrap-admin.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: process.env.TEST_DATABASE_URL,
        ADMIN_EMAIL: address,
        ADMIN_PASSWORD: password,
      },
      encoding: 'utf8',
    });
  let id;
  try {
    assert.equal(run(email).status, 0);
    const created = await owner.user.findUnique({ where: { email } });
    id = created.id;
    assert.equal(created.role, 'ADMIN');
    assert.notEqual(created.passwordHash, password);
    assert.match(created.passwordHash, /^\$argon2id\$/);
    assert.equal(run(email).status, 0);
    assert.equal(
      (await owner.user.findUnique({ where: { email } })).passwordHash,
      created.passwordHash,
    );
    assert.notEqual(run(`${users[1]}@example.test`).status, 0);
    assert.equal(
      (await owner.user.findUnique({ where: { id: users[1] } })).role,
      'PATIENT',
    );
  } finally {
    if (id) {
      await owner.auditLog.deleteMany({ where: { actorId: id } });
      await owner.user.delete({ where: { id } });
    }
  }
});
