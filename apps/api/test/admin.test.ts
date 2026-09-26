import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminService, requireAdmin } from '../src/admin/admin.service.js';
import {
  userPatchSchema,
  listSchema,
  directorySchema,
  medicineSchema,
  settingsSchema,
} from '../src/admin/admin.schemas.js';
import type { DatabaseService } from '../src/database.service.js';
import type { AuthService } from '../src/auth/auth.service.js';
test('every non-admin role is refused before accessing administration storage', async () => {
  const db = new Proxy(
    {},
    {
      get() {
        throw new Error('Storage must not be accessed');
      },
    },
  ) as DatabaseService;
  const service = new AdminService(db, {} as AuthService);
  for (const role of ['PATIENT', 'DOCTOR', 'PHARMACY', 'UNKNOWN']) {
    const actor = { userId: 'actor', sessionId: 'session', role };
    assert.throws(() => requireAdmin(actor), { message: 'Access is denied.' });
    for (const operation of [
      () => service.overview(actor),
      () => service.users(actor, { page: 1, q: '' }),
      () => service.medicines(actor, { page: 1, q: '' }),
      () => service.directory(actor, 'doctors', { page: 1, q: '' }),
      () => service.settings(actor),
      () => service.userStatus(actor, 'id', { status: 'DISABLED' }, 'request'),
    ])
      await assert.rejects(operation, { message: 'Access is denied.' });
  }
});
test('admin inputs reject escalation, invalid statuses and unbounded queries', () => {
  assert.equal(
    userPatchSchema.safeParse({ status: 'ACTIVE', role: 'ADMIN' }).success,
    false,
  );
  assert.equal(
    userPatchSchema.safeParse({ status: 'PENDING_VERIFICATION' }).success,
    false,
  );
  assert.equal(listSchema.safeParse({ page: 0 }).success, false);
  assert.equal(
    listSchema.safeParse({ page: 1, q: 'x'.repeat(101) }).success,
    false,
  );
  assert.equal(
    medicineSchema.safeParse({ name: 'x', source: '', status: 'ACTIVE' })
      .success,
    false,
  );
  assert.equal(
    directorySchema.safeParse({
      name: 'Doctor',
      verified: true,
      status: 'ACTIVE',
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      organizationName: 'A',
      supportEmail: null,
      defaultLanguage: 'EN',
      timezone: 'Bad/Zone',
    }).success,
    false,
  );
});
test('mutation rechecks the live administrator role inside the transaction', async () => {
  let audited = false,
    changed = false;
  const tx = {
    user: { findUnique: async () => ({ role: 'PATIENT' }) },
    adminSettings: {
      upsert: async () => {
        changed = true;
      },
    },
    auditLog: {
      createMany: async () => {
        audited = true;
      },
    },
  };
  const db = {
    client: {
      $transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
    },
  } as unknown as DatabaseService;
  const auth = {
    authorizeOwnerMutation: async () => {},
  } as unknown as AuthService;
  await assert.rejects(
    () =>
      new AdminService(db, auth).saveSettings(
        { role: 'ADMIN', userId: 'actor', sessionId: 'session' },
        {
          organizationName: 'Test',
          supportEmail: null,
          defaultLanguage: 'EN',
          timezone: 'UTC',
        },
        'req',
      ),
    { message: 'Access is denied.' },
  );
  assert.equal(changed, false);
  assert.equal(audited, false);
});
