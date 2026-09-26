import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScanPreferencesController } from '../src/prescriptions/scan-preferences.controller.js';
import type { DatabaseService } from '../src/database.service.js';
import type { AuthService } from '../src/auth/auth.service.js';
import type { AuthRequest } from '../src/auth/auth.guard.js';
function fixture() {
  const saved = new Map<string, boolean | null>([
    ['alice', null],
    ['bob', false],
  ]);
  const audits: unknown[] = [];
  let allow = true;
  const tx = {
    $queryRaw: async (_sql: TemplateStringsArray, id: string) =>
      saved.has(id) ? [{ consent: saved.get(id) }] : [],
    $executeRaw: async (
      _sql: TemplateStringsArray,
      consent: boolean,
      id: string,
    ) => {
      if (!saved.has(id)) return 0;
      saved.set(id, consent);
      return 1;
    },
    auditLog: {
      createMany: async (value: unknown) => {
        audits.push(value);
      },
    },
  };
  const db = {
    client: {
      ...tx,
      $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
    },
  };
  const auth = {
    authorizeOwnerMutation: async () => {
      if (!allow) throw new Error('revoked session');
    },
  };
  const controller = new ScanPreferencesController(
    db as unknown as DatabaseService,
    auth as unknown as AuthService,
  );
  const request = (id: string, role = 'PATIENT'): AuthRequest => ({
    headers: {},
    socket: {},
    requestId: 'test',
    auth: { userId: id, sessionId: 'session', role },
  });
  return {
    controller,
    request,
    saved,
    audits,
    revoke: () => {
      allow = false;
    },
  };
}
test('scan consent starts unconfigured and persists separately for each authenticated user', async () => {
  const f = fixture();
  assert.deepEqual((await f.controller.get(f.request('alice'))).data, {
    configured: false,
    processingConsent: false,
  });
  await f.controller.patch({ processingConsent: true }, f.request('alice'));
  assert.deepEqual((await f.controller.get(f.request('alice'))).data, {
    configured: true,
    processingConsent: true,
  });
  assert.deepEqual((await f.controller.get(f.request('bob'))).data, {
    configured: true,
    processingConsent: false,
  });
  await f.controller.patch({ processingConsent: false }, f.request('alice'));
  assert.deepEqual((await f.controller.get(f.request('alice'))).data, {
    configured: true,
    processingConsent: false,
  });
  assert.equal(f.audits.length, 2);
});
test('scan settings reject forged ownership, invalid consent and non-patient access', async () => {
  const f = fixture();
  for (const input of [
    {},
    { processingConsent: 'true' },
    { processingConsent: null },
    { processingConsent: true, userId: 'bob' },
  ]) {
    await assert.rejects(() => f.controller.patch(input, f.request('alice')));
  }
  await assert.rejects(() => f.controller.get(f.request('alice', 'ADMIN')));
  await assert.rejects(() =>
    f.controller.patch(
      { processingConsent: true },
      f.request('alice', 'ADMIN'),
    ),
  );
  assert.equal(f.saved.get('alice'), null);
  assert.equal(f.audits.length, 0);
});
test('scan preference writes recheck the active session and fail for missing profiles', async () => {
  const f = fixture();
  await assert.rejects(() => f.controller.get(f.request('missing')));
  await assert.rejects(() =>
    f.controller.patch({ processingConsent: true }, f.request('missing')),
  );
  f.revoke();
  await assert.rejects(
    () => f.controller.patch({ processingConsent: true }, f.request('alice')),
    /revoked session/,
  );
  assert.equal(f.saved.get('alice'), null);
});
