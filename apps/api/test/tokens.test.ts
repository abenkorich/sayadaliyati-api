import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { decodeJwt } from 'jose';
import { readConfig } from '../src/config.js';
import { TokensService } from '../src/auth/tokens.service.js';
import { PasswordsService } from '../src/auth/passwords.service.js';
import { registrationSchema, timezoneSchema } from '@saydaliyati/validation';

const config = readConfig({
  AUTH_SECRET: 'ab'.repeat(32),
  REDIS_URL: 'redis://127.0.0.1:1/1',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
});
const tokens = new TokensService(config);

test('access tokens have minimal claims and never outlive the session', async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const expires = new Date(Date.now() + 60000);
  const token = await tokens.access(userId, sessionId, expires);
  assert.deepEqual(await tokens.verifyAccess(token), { userId, sessionId });
  const claims = decodeJwt(token);
  assert.equal(claims.exp, Math.floor(expires.getTime() / 1000));
  assert.equal(claims.role, undefined);
  assert.equal(claims.email, undefined);
  await assert.rejects(
    tokens.verifyAccess(
      await tokens.access(userId, sessionId, new Date(Date.now() - 1000)),
    ),
  );
  const other = new TokensService({ ...config, AUTH_SECRET: 'cd'.repeat(32) });
  await assert.rejects(other.verifyAccess(token));
});

test('refresh signatures reject forgery before a session can be affected', () => {
  const id = randomUUID();
  const token = tokens.refresh(id);
  assert.equal(tokens.verifyRefresh(token), id);
  assert.notEqual(tokens.refresh(id), token);
  assert.equal(tokens.matches(token, tokens.hash(token)), true);
  assert.equal(tokens.matches(token, tokens.hash('different')), false);
  assert.throws(() => tokens.verifyRefresh(token.replace(id, randomUUID())));
  assert.throws(() => tokens.verifyRefresh(`${token.slice(0, -1)}!`));
  assert.throws(() => tokens.verifyRefresh('malformed'));
  assert.equal(tokens.hash(token).length, 64);
});

test('passwords are salted Argon2id and exact input is preserved', async () => {
  const passwords = new PasswordsService();
  await passwords.onModuleInit();
  const password = '  un mot de passe long  ';
  const first = await passwords.hash(password);
  const second = await passwords.hash(password);
  assert.match(first, /^\$argon2id\$v=19\$/);
  assert.deepEqual(
    Object.fromEntries(
      first
        .split('$')[3]!
        .split(',')
        .map((pair) => pair.split('=')),
    ),
    { m: '65536', t: '3', p: '1' },
  );
  assert.notEqual(first, second);
  assert.equal(await passwords.verify(password, first), true);
  assert.equal(await passwords.verify(password.trim(), first), false);
  assert.equal(await passwords.verify(password, null), false);
});

test('expensive password hashing rejects excess concurrent work', async () => {
  const passwords = new PasswordsService();
  await passwords.onModuleInit();
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      passwords.hash('a sufficiently long password'),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    4,
  );
  assert.equal(
    results.filter((result) => result.status === 'rejected').length,
    1,
  );
});

test('shared validation normalizes identifiers and rejects privilege fields and invalid timezones', () => {
  const data = {
    email: ' USER@EXAMPLE.TEST ',
    password: 'correct horse battery staple',
    firstName: ' Alice ',
    lastName: ' Patient ',
    preferredLanguage: 'FR',
    timezone: 'Africa/Algiers',
  };
  const parsed = registrationSchema.parse(data);
  assert.equal(parsed.email, 'user@example.test');
  assert.equal(parsed.firstName, 'Alice');
  assert.equal(
    registrationSchema.safeParse({ ...data, role: 'ADMIN' }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({ ...data, password: '🔐'.repeat(8) }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({
      ...data,
      password: 'a sufficiently long password\uD800',
    }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({
      ...data,
      email: undefined,
      phone: undefined,
    }).success,
    false,
  );
  assert.equal(timezoneSchema.safeParse('not/a-zone').success, false);
  assert.equal(timezoneSchema.safeParse('+01:00').success, false);
  assert.equal(timezoneSchema.safeParse('UTC').success, true);
});
