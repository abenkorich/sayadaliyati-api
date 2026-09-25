import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import pg from 'pg';
import { createDatabaseClient, isDatabaseReady } from '../dist/index.js';

const connectionString = process.env['TEST_DATABASE_URL'];
const runtimeString = process.env['TEST_RUNTIME_DATABASE_URL'];
if (!connectionString || !runtimeString)
  throw new Error('Run pnpm test:integration from the project root.');
for (const value of [connectionString, runtimeString]) {
  const url = new URL(value);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/saydaliyati_test');
}

const pool = new pg.Pool({ connectionString });
const runtime = new pg.Pool({ connectionString: runtimeString });
const prisma = createDatabaseClient(connectionString);
after(async () => {
  await Promise.all([pool.end(), runtime.end(), prisma.$disconnect()]);
});

/** @param {(client: pg.PoolClient) => Promise<void>} action */
async function transaction(action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await action(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** @param {pg.PoolClient} client */
async function user(client) {
  const id = randomUUID();
  await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `${id}@example.test`,
  ]);
  return id;
}

test('Prisma can query the migrated schema and persist mapped profile/session data', async () => {
  assert.equal(await isDatabaseReady(prisma), true);
  const rollback = new Error('test rollback');
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          patientProfile: {
            create: {
              firstName: 'Test',
              lastName: 'Patient',
              preferredLanguage: 'FR',
              timezone: 'Africa/Algiers',
            },
          },
          sessions: {
            create: {
              refreshTokenHash: 'test-verification-material',
              expiresAt: new Date(Date.now() + 60000),
            },
          },
        },
        include: { patientProfile: true, sessions: true },
      });
      assert.equal(created.patientProfile?.preferredLanguage, 'FR');
      assert.equal(created.role, 'PATIENT');
      assert.equal(created.sessions.length, 1);
      assert.equal(created.sessions[0]?.revokedAt, null);
      throw rollback;
    });
    assert.fail('Transaction must roll back');
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

for (const [label, sql, values] of [
  ['missing identity', 'INSERT INTO users DEFAULT VALUES', []],
  ['blank email', 'INSERT INTO users (email) VALUES ($1)', ['']],
  [
    'unnormalized email',
    'INSERT INTO users (email) VALUES ($1)',
    [' TEST@EXAMPLE.TEST '],
  ],
  [
    'unnormalized phone',
    'INSERT INTO users (phone) VALUES ($1)',
    ['0555000000'],
  ],
]) {
  test(`database rejects ${label}`, async () => {
    await transaction(async (client) => {
      await assert.rejects(
        client.query(String(sql), /** @type {unknown[]} */ (values)),
        { code: '23514' },
      );
    });
  });
}

test('normalized identities are unique, while absent identifiers may repeat', async () => {
  await transaction(async (client) => {
    await user(client);
    await user(client);
    const id = await user(client);
    await assert.rejects(
      client.query('INSERT INTO users (email) VALUES ($1)', [
        `${id}@example.test`,
      ]),
      { code: '23505' },
    );
  });
});

test('normalized phone numbers are unique', async () => {
  await transaction(async (client) => {
    await client.query('INSERT INTO users (phone) VALUES ($1)', [
      '+213555000111',
    ]);
    await assert.rejects(
      client.query('INSERT INTO users (phone) VALUES ($1)', ['+213555000111']),
      { code: '23505' },
    );
  });
});

test('sessions must expire after creation', async () => {
  await transaction(async (client) => {
    const id = await user(client);
    await assert.rejects(
      client.query(
        "INSERT INTO sessions (user_id, refresh_token_hash, created_at, expires_at) VALUES ($1, 'test-hash', now(), now())",
        [id],
      ),
      { code: '23514' },
    );
  });
});

test('session verification material cannot be empty', async () => {
  await transaction(async (client) => {
    const id = await user(client);
    await assert.rejects(
      client.query(
        "INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, '', now() + interval '1 hour')",
        [id],
      ),
      { code: '23514' },
    );
  });
});

test('profiles cannot reference nonexistent users', async () => {
  await transaction(async (client) => {
    await assert.rejects(
      client.query(
        "INSERT INTO patient_profiles (user_id, first_name, last_name) VALUES ($1, 'Test', 'Patient')",
        [randomUUID()],
      ),
      { code: '23503' },
    );
  });
});

test('session ownership cannot reference nonexistent users', async () => {
  await transaction(async (client) => {
    await assert.rejects(
      client.query(
        "INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, 'test-hash', now() + interval '1 hour')",
        [randomUUID()],
      ),
      { code: '23503' },
    );
  });
});

test('deleting users cannot cascade into profiles', async () => {
  await transaction(async (client) => {
    const id = await user(client);
    await client.query(
      "INSERT INTO patient_profiles (user_id, first_name, last_name) VALUES ($1, 'Test', 'Patient')",
      [id],
    );
    await assert.rejects(
      client.query('DELETE FROM users WHERE id = $1', [id]),
      { code: '23503' },
    );
  });
});

test('deleting users cannot cascade into sessions', async () => {
  await transaction(async (client) => {
    const id = await user(client);
    await client.query(
      "INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES ($1, 'test-hash', now() + interval '1 hour')",
      [id],
    );
    await assert.rejects(
      client.query('DELETE FROM users WHERE id = $1', [id]),
      { code: '23503' },
    );
  });
});

test('runtime privileges exclude role changes, deletes, schema writes and audit mutation', async () => {
  const privileges = await runtime.query(`SELECT
    has_table_privilege(current_user, 'users', 'SELECT') AS can_read,
    has_table_privilege(current_user, 'users', 'DELETE') AS can_delete,
    has_column_privilege(current_user, 'users', 'role', 'UPDATE') AS can_change_role,
    has_column_privilege(current_user, 'users', 'status', 'UPDATE') AS can_change_status,
    has_column_privilege(current_user, 'users', 'role', 'INSERT') AS can_insert_role,
    has_table_privilege(current_user, 'audit_logs', 'UPDATE') AS can_update_audit,
    has_table_privilege(current_user, 'audit_logs', 'DELETE') AS can_delete_audit,
    has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`);
  assert.deepEqual(privileges.rows[0], {
    can_read: true,
    can_delete: false,
    can_change_role: false,
    can_change_status: false,
    can_insert_role: false,
    can_update_audit: false,
    can_delete_audit: false,
    can_create: false,
  });
  await assert.rejects(runtime.query('SELECT * FROM audit_logs'), {
    code: '42501',
  });
  await assert.rejects(
    runtime.query("UPDATE users SET role = 'ADMIN' WHERE false"),
    { code: '42501' },
  );
  await assert.rejects(runtime.query('DELETE FROM audit_logs WHERE false'), {
    code: '42501',
  });
});

test('session lookup index matches the approved query fields', async () => {
  const result = await pool.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'sessions_user_idx'",
  );
  assert.match(
    result.rows[0]?.indexdef ?? '',
    /\(user_id, revoked_at, expires_at\)/,
  );
});
