import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { Redis } from 'ioredis';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
import { TokensService } from '../dist/auth/tokens.service.js';
import { RateLimitService } from '../dist/auth/rate-limit.service.js';

const ownerUrl = process.env['TEST_DATABASE_URL'];
const runtimeUrl = process.env['TEST_RUNTIME_DATABASE_URL'];
const redisUrl = process.env['TEST_REDIS_URL'];
assert.ok(
  ownerUrl && runtimeUrl && redisUrl,
  'Use the root integration-test command.',
);
for (const value of [ownerUrl, runtimeUrl]) {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/saydaliyati_test');
}
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(redisUrl).hostname),
);
assert.equal(new URL(redisUrl).pathname, '/1');
const config = readConfig({
  NODE_ENV: 'test',
  AUTH_SECRET: 'ab'.repeat(32),
  DATABASE_URL: runtimeUrl,
  REDIS_URL: redisUrl,
});
const owner = createDatabaseClient(ownerUrl);
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const users = [];
const requestIds = [];
let app;
let base;
const password = 'une phrase de passe longue et unique';
const sample = () => ({
  email: `${randomUUID()}@example.test`,
  password,
  firstName: 'Alice',
  lastName: 'Patient',
  preferredLanguage: 'FR',
  timezone: 'Africa/Algiers',
});

async function request(path, method = 'GET', body, token, extraHeaders = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const id = response.headers.get('x-request-id');
  if (id) requestIds.push(id);
  const data = await response.json();
  return { status: response.status, body: data, headers: response.headers };
}
async function register(input = sample()) {
  const response = await request('/auth/register', 'POST', input);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  users.push(response.body.data.user.id);
  return { ...response.body.data, input };
}
async function clearRates() {
  // This helper is guarded above to local Redis DB 1, never development DB 0.
  const keys = await redis.keys('saydaliyati:auth:*');
  if (keys.length) await redis.del(...keys);
}
before(async () => {
  app = await createApplication(config);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
beforeEach(clearRates);
after(async () => {
  try {
    await owner.$transaction(async (tx) => {
      if (requestIds.length)
        await tx.$executeRaw`DELETE FROM audit_logs WHERE metadata->>'requestId' = ANY(${requestIds}::text[])`;
      if (users.length) {
        await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
        await tx.session.deleteMany({ where: { userId: { in: users } } });
        await tx.patientProfile.deleteMany({
          where: { userId: { in: users } },
        });
        await tx.user.deleteMany({ where: { id: { in: users } } });
      }
    });
    await clearRates();
  } finally {
    await app?.close();
    await owner.$disconnect();
    redis.disconnect();
  }
});

test('registration persists a patient/profile/session with hashes only and an audit record', async () => {
  const input = sample();
  input.email = ` ${input.email.toUpperCase()} `;
  const result = await register(input);
  assert.equal(result.user.role, 'PATIENT');
  const row = await owner.user.findUniqueOrThrow({
    where: { id: result.user.id },
    include: { patientProfile: true, sessions: true },
  });
  assert.equal(row.email, input.email.trim().toLowerCase());
  assert.equal(row.emailVerifiedAt, null);
  assert.equal(row.phoneVerifiedAt, null);
  assert.match(row.passwordHash, /^\$argon2id\$/);
  assert.equal(row.patientProfile.timezone, 'Africa/Algiers');
  assert.match(row.sessions[0].refreshTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(
    row.sessions[0].refreshTokenHash,
    app.get(TokensService).hash(result.refreshToken),
  );
  assert.ok(!JSON.stringify(row).includes(result.refreshToken));
  const audit = await owner.auditLog.findMany({ where: { actorId: row.id } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'SESSION_CREATED');
  assert.ok(!JSON.stringify(audit).includes(password));
  assert.ok(!JSON.stringify(audit).includes(result.accessToken));
  const profile = await request(
    '/me/profile',
    'GET',
    undefined,
    result.accessToken,
  );
  assert.equal(profile.status, 200);
  assert.deepEqual(Object.keys(profile.body.data).sort(), [
    'email',
    'firstName',
    'lastName',
    'phone',
    'preferredLanguage',
    'timezone',
  ]);
});

test('phone-only registration and login use international identifiers', async () => {
  const input = sample();
  delete input.email;
  input.phone = `+213${String(Date.now()).slice(-9)}`;
  const result = await register(input);
  const login = await request('/auth/login', 'POST', {
    identifier: input.phone,
    password,
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.id, result.user.id);
});

test('invalid registration cannot choose role/status/owner or create partial records', async () => {
  const input = sample();
  for (const extra of [
    { role: 'ADMIN' },
    { status: 'ACTIVE' },
    { userId: randomUUID() },
    { emailVerifiedAt: new Date().toISOString() },
    { timezone: '+01:00' },
  ]) {
    const result = await request('/auth/register', 'POST', {
      ...input,
      ...extra,
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  }
  assert.equal(await owner.user.count({ where: { email: input.email } }), 0);
});

test('duplicate registration rolls back and returns a generic error', async () => {
  const result = await register();
  const duplicate = await request('/auth/register', 'POST', {
    ...result.input,
    email: result.input.email.toUpperCase(),
  });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(duplicate.body.error.details, {});
  assert.equal(
    await owner.user.count({ where: { email: result.input.email } }),
    1,
  );
  assert.equal(
    await owner.session.count({ where: { userId: result.user.id } }),
    1,
  );
});

test('login creates independent sessions and wrong credentials share one response', async () => {
  const result = await register();
  const bad = await request('/auth/login', 'POST', {
    identifier: result.input.email,
    password: 'wrong',
  });
  const unknown = await request('/auth/login', 'POST', {
    identifier: `${randomUUID()}@example.test`,
    password: 'wrong',
  });
  assert.equal(bad.status, 401);
  assert.deepEqual(unknown.body, bad.body);
  const login = await request('/auth/login', 'POST', {
    identifier: result.input.email.toUpperCase(),
    password,
  });
  assert.equal(login.status, 200);
  assert.notEqual(login.body.data.refreshToken, result.refreshToken);
  assert.equal(
    await owner.session.count({ where: { userId: result.user.id } }),
    2,
  );
});

test('missing and forged bearer credentials cannot read a profile', async () => {
  const result = await register();
  assert.equal((await request('/me/profile')).body.error.code, 'AUTH_REQUIRED');
  const forged = `${result.accessToken.slice(0, 10)}x${result.accessToken.slice(11)}`;
  assert.equal(
    (await request('/me/profile', 'GET', undefined, forged)).status,
    401,
  );
  assert.equal(
    (await request('/me/profile', 'GET', undefined, 'not.a.token')).status,
    401,
  );
});

test('profile updates cannot target another patient or alter identity and role', async () => {
  const alice = await register();
  const bob = await register({ ...sample(), firstName: 'Bob' });
  for (const patch of [
    { userId: bob.user.id, firstName: 'Changed' },
    { patientId: bob.user.id },
    { role: 'ADMIN' },
    { email: bob.input.email },
  ]) {
    const response = await request(
      '/me/profile',
      'PATCH',
      patch,
      alice.accessToken,
    );
    assert.equal(response.status, 400);
  }
  const changed = await request(
    '/me/profile',
    'PATCH',
    {
      firstName: 'Alicia',
      preferredLanguage: 'AR',
      timezone: 'Africa/Algiers',
    },
    alice.accessToken,
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.firstName, 'Alicia');
  const unchanged = await request(
    '/me/profile',
    'GET',
    undefined,
    bob.accessToken,
  );
  assert.equal(unchanged.body.data.firstName, 'Bob');
  const queryAttempt = await request(
    `/me/profile?patientId=${bob.user.id}`,
    'GET',
    undefined,
    alice.accessToken,
  );
  assert.equal(queryAttempt.body.data.firstName, 'Alicia');
});

test('database role changes are enforced even for an existing access token', async () => {
  const result = await register();
  await owner.user.update({
    where: { id: result.user.id },
    data: { role: 'DOCTOR' },
  });
  assert.equal(
    (await request('/me/profile', 'GET', undefined, result.accessToken)).status,
    403,
  );
});

test('disabled, suspended and pending accounts fail closed without a password oracle', async () => {
  const result = await register();
  for (const [status, code] of [
    ['DISABLED', 'AUTH_ACCOUNT_DISABLED'],
    ['SUSPENDED', 'AUTH_ACCOUNT_SUSPENDED'],
    ['PENDING_VERIFICATION', 'FORBIDDEN'],
  ]) {
    await owner.user.update({
      where: { id: result.user.id },
      data: { status },
    });
    const wrong = await request('/auth/login', 'POST', {
      identifier: result.input.email,
      password: 'wrong',
    });
    assert.equal(wrong.body.error.code, 'AUTH_INVALID_CREDENTIALS');
    const correct = await request('/auth/login', 'POST', {
      identifier: result.input.email,
      password,
    });
    assert.equal(correct.status, 403);
    assert.equal(correct.body.error.code, code);
    assert.equal(
      (await request('/me/profile', 'GET', undefined, result.accessToken)).body
        .error.code,
      code,
    );
  }
});

test('refresh rotates once, persists only the new hash, and preserves absolute expiry', async () => {
  const result = await register();
  const sid = result.refreshToken.split('.')[0];
  const original = await owner.session.findUniqueOrThrow({
    where: { id: sid },
  });
  const refresh = await request('/auth/refresh', 'POST', {
    refreshToken: result.refreshToken,
  });
  assert.equal(refresh.status, 200);
  assert.notEqual(refresh.body.data.refreshToken, result.refreshToken);
  const rotated = await owner.session.findUniqueOrThrow({ where: { id: sid } });
  assert.equal(rotated.expiresAt.getTime(), original.expiresAt.getTime());
  assert.notEqual(rotated.refreshTokenHash, original.refreshTokenHash);
  assert.ok(rotated.lastUsedAt);
  assert.equal(
    (
      await request(
        '/me/profile',
        'GET',
        undefined,
        refresh.body.data.accessToken,
      )
    ).status,
    200,
  );
});

test('forged refresh tokens cannot revoke a guessed existing session', async () => {
  const result = await register();
  const parts = result.refreshToken.split('.');
  parts[1] = 'a'.repeat(43);
  const invalid = await request('/auth/refresh', 'POST', {
    refreshToken: parts.join('.'),
  });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'AUTH_INVALID_CREDENTIALS');
  assert.equal(
    (await request('/me/profile', 'GET', undefined, result.accessToken)).status,
    200,
  );
  assert.equal(
    (
      await request('/auth/refresh', 'POST', {
        refreshToken: result.refreshToken,
      })
    ).status,
    200,
  );
});

test('authentic old-token replay commits revocation of the entire session', async () => {
  const result = await register();
  const rotation = await request('/auth/refresh', 'POST', {
    refreshToken: result.refreshToken,
  });
  const replay = await request('/auth/refresh', 'POST', {
    refreshToken: result.refreshToken,
  });
  assert.equal(replay.body.error.code, 'AUTH_SESSION_REVOKED');
  assert.equal(
    (
      await request(
        '/me/profile',
        'GET',
        undefined,
        rotation.body.data.accessToken,
      )
    ).body.error.code,
    'AUTH_SESSION_REVOKED',
  );
  assert.equal(
    (
      await request('/auth/refresh', 'POST', {
        refreshToken: rotation.body.data.refreshToken,
      })
    ).body.error.code,
    'AUTH_SESSION_REVOKED',
  );
  assert.ok(
    (
      await owner.session.findUniqueOrThrow({
        where: { id: result.refreshToken.split('.')[0] },
      })
    ).revokedAt,
  );
});

test('concurrent refresh has one winner, then revokes the family on the rejected replay', async () => {
  const result = await register();
  const responses = await Promise.all([
    request('/auth/refresh', 'POST', { refreshToken: result.refreshToken }),
    request('/auth/refresh', 'POST', { refreshToken: result.refreshToken }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
  const winner = responses.find((r) => r.status === 200);
  assert.equal(
    (
      await request(
        '/me/profile',
        'GET',
        undefined,
        winner.body.data.accessToken,
      )
    ).body.error.code,
    'AUTH_SESSION_REVOKED',
  );
  const logs = await owner.auditLog.findMany({
    where: { actorId: result.user.id },
  });
  assert.equal(
    logs.filter((row) => row.action === 'SESSION_ROTATED').length,
    1,
  );
  assert.equal(
    logs.filter((row) => row.action === 'SESSION_REUSE_DETECTED').length,
    1,
  );
});

test('expired sessions deny both access and authentic refresh tokens', async () => {
  const result = await register();
  await owner.session.update({
    where: { id: result.refreshToken.split('.')[0] },
    data: {
      createdAt: new Date(Date.now() - 32 * 86400000),
      expiresAt: new Date(Date.now() - 86400000),
    },
  });
  assert.equal(
    (await request('/me/profile', 'GET', undefined, result.accessToken)).body
      .error.code,
    'AUTH_SESSION_EXPIRED',
  );
  assert.equal(
    (
      await request('/auth/refresh', 'POST', {
        refreshToken: result.refreshToken,
      })
    ).body.error.code,
    'AUTH_SESSION_EXPIRED',
  );
});

test('logout is idempotent, revokes access immediately and leaves other sessions active', async () => {
  const result = await register();
  const other = await request('/auth/login', 'POST', {
    identifier: result.input.email,
    password,
  });
  for (let index = 0; index < 2; index++) {
    const logout = await request(
      '/auth/logout',
      'POST',
      {},
      result.accessToken,
    );
    assert.equal(logout.status, 200);
    assert.deepEqual(logout.body, { data: {}, meta: {} });
  }
  assert.equal(
    (await request('/me/profile', 'GET', undefined, result.accessToken)).body
      .error.code,
    'AUTH_SESSION_REVOKED',
  );
  assert.equal(
    (
      await request('/auth/refresh', 'POST', {
        refreshToken: result.refreshToken,
      })
    ).body.error.code,
    'AUTH_SESSION_REVOKED',
  );
  assert.equal(
    (
      await request(
        '/me/profile',
        'GET',
        undefined,
        other.body.data.accessToken,
      )
    ).status,
    200,
  );
  assert.equal(
    await owner.auditLog.count({
      where: { actorId: result.user.id, action: 'SESSION_REVOKED' },
    }),
    1,
  );
});

test('registration audit failure rolls back user/profile/session creation', async () => {
  const input = sample();
  await owner.$executeRaw`REVOKE INSERT ON audit_logs FROM saydaliyati_app`;
  try {
    const result = await request('/auth/register', 'POST', input);
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, 'PROCESSING_FAILED');
    assert.equal(await owner.user.count({ where: { email: input.email } }), 0);
  } finally {
    await owner.$executeRaw`GRANT INSERT ON audit_logs TO saydaliyati_app`;
  }
});

test('registration rate limit counts invalid bodies and ignores spoofed forwarding headers', async () => {
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await request('/auth/register', 'POST', {}, undefined, {
          'x-forwarded-for': `192.0.2.${i}`,
        })
      ).status,
      400,
    );
  const result = await request('/auth/register', 'POST', {}, undefined, {
    'x-forwarded-for': '198.51.100.1',
  });
  assert.equal(result.status, 429);
  assert.equal(result.body.error.code, 'RATE_LIMITED');
});

test('normalized-identifier login limits are shared and rate keys contain no identifiers or IPs', async () => {
  const identifier = `${randomUUID()}@example.test`;
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await request('/auth/login', 'POST', {
          identifier: i % 2 ? identifier.toUpperCase() : identifier,
          password: 'wrong',
        })
      ).status,
      401,
    );
  assert.equal(
    (await request('/auth/login', 'POST', { identifier, password: 'wrong' }))
      .status,
    429,
  );
  const keys = await redis.keys('saydaliyati:auth:*');
  assert.ok(keys.length);
  assert.ok(
    keys.every(
      (key) => !key.includes(identifier) && !key.includes('127.0.0.1'),
    ),
  );
  for (const key of keys) assert.ok((await redis.pttl(key)) > 0);
});

test('atomic rate counters enforce one shared budget across service instances', async () => {
  const other = new RateLimitService(config, app.get(TokensService));
  try {
    const rates = app.get(RateLimitService);
    const identity = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? rates : other).check('atomic-test', identity, 5, 60000),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 15);
  } finally {
    other.onApplicationShutdown();
  }
});

test('Redis failure blocks login and protected access while liveness remains available', async () => {
  const unavailable = await createApplication({
    ...config,
    REDIS_URL: 'redis://127.0.0.1:1/1',
  });
  try {
    await unavailable.listen(0, '127.0.0.1');
    const url = await unavailable.getUrl();
    for (const path of ['/api/v1/auth/login', '/api/v1/me/profile']) {
      const response = await fetch(
        `${url}${path}`,
        path.endsWith('login')
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                identifier: 'nobody@example.test',
                password,
              }),
            }
          : {},
      );
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'SERVICE_UNAVAILABLE');
    }
    const live = await fetch(`${url}/api/v1/health/live`);
    assert.equal(live.status, 200);
    await live.arrayBuffer();
    const ready = await fetch(`${url}/api/v1/health/ready`);
    assert.equal(ready.status, 503);
    await ready.arrayBuffer();
  } finally {
    await unavailable.close();
  }
});

test('oversized JSON is rejected without exposing the submitted password', async () => {
  const response = await request('/auth/login', 'POST', {
    identifier: 'nobody@example.test',
    password: 'x'.repeat(20000),
  });
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, 'FILE_TOO_LARGE');
});
