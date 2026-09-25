import { setTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { Redis } from 'ioredis';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
import { ReminderDelivery } from '../dist/reminders/delivery.js';
import { ReminderQueue } from '../dist/reminders/queue.js';
import { TokensService } from '../dist/auth/tokens.service.js';
for (const name of ['TEST_DATABASE_URL', 'TEST_RUNTIME_DATABASE_URL']) {
  const u = new URL(process.env[name]);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname));
  assert.equal(u.pathname, '/saydaliyati_test');
}
const redisUrl = new URL(process.env['TEST_REDIS_URL']);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(redisUrl.hostname));
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
  redis = new Redis(redisUrl.href),
  users = [randomUUID(), randomUUID()],
  sessions = [randomUUID(), randomUUID(), randomUUID()],
  medicineId = randomUUID(),
  tokens = [];
let app, base;
async function request(path, method = 'GET', payload, token = tokens[0]) {
  const r = await fetch(`${base}/api/v1/me${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
async function cleanup() {
  const notifications = await owner.notification.findMany({
    where: { userId: { in: users } },
    select: { id: true },
  });
  await owner.auditLog.deleteMany({
    where: { resourceId: { in: notifications.map((n) => n.id) } },
  });
  await owner.notification.deleteMany({ where: { userId: { in: users } } });
  await owner.notificationPreferences.deleteMany({
    where: { userId: { in: users } },
  });
  await owner.medicationEvent.deleteMany({
    where: { patientId: { in: users } },
  });
  await owner.medicationOccurrence.deleteMany({
    where: { patientId: { in: users } },
  });
  await owner.medicationSchedule.deleteMany({
    where: { medication: { treatment: { patientId: { in: users } } } },
  });
  await owner.treatmentMedication.deleteMany({
    where: { treatment: { patientId: { in: users } } },
  });
  await owner.treatment.deleteMany({ where: { patientId: { in: users } } });
  await owner.prescriptionExtractedField.deleteMany({
    where: { medication: { prescription: { patientId: { in: users } } } },
  });
  await owner.prescriptionMedication.deleteMany({
    where: { prescription: { patientId: { in: users } } },
  });
  await owner.prescription.deleteMany({ where: { patientId: { in: users } } });
  await owner.auditLog.deleteMany({ where: { actorId: { in: users } } });
}
before(async () => {
  for (const id of users)
    await owner.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        patientProfile: {
          create: { firstName: 'Synthetic', lastName: 'Test', timezone: 'UTC' },
        },
      },
    });
  await owner.medicine.create({
    data: {
      id: medicineId,
      name: 'DEMO treatment medicine',
      normalizedName: 'demo treatment medicine',
      source: 'SYNTHETIC_TEST_FIXTURE',
    },
  });
  const expiresAt = new Date(Date.now() + 3600000);
  for (const [i, id] of sessions.entries()) {
    const userId = i === 1 ? users[1] : users[0];
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
  await owner.patientProfile.updateMany({
    where: { userId: { in: users } },
    data: { timezone: 'UTC' },
  });
  await redis.del(
    `saydaliyati:auth:protected-ip:${signer.rateDigest('127.0.0.1')}`,
  );
});
after(async () => {
  try {
    await cleanup();
    await owner.session.deleteMany({ where: { userId: { in: users } } });
    await owner.patientProfile.deleteMany({ where: { userId: { in: users } } });
    await owner.user.deleteMany({ where: { id: { in: users } } });
    await owner.medicine.delete({ where: { id: medicineId } });
  } finally {
    await app?.close();
    await owner.$disconnect();
    await runtime.$disconnect();
    redis.disconnect();
  }
});

const delivery = new ReminderDelivery(runtime);
async function fixture(minutes = -1, language = 'EN') {
  const at = new Date(Math.floor(Date.now() / 60000) * 60000 + minutes * 60000),
    date = new Date(at.toISOString().slice(0, 10));
  await owner.patientProfile.update({
    where: { userId: users[0] },
    data: { preferredLanguage: language },
  });
  await owner.notificationPreferences.upsert({
    where: { userId: users[0] },
    create: {
      userId: users[0],
      doseReminders: true,
      expiryReminders: false,
      lowStockAlerts: false,
      sharingNotifications: false,
      systemNotifications: false,
    },
    update: { doseReminders: true },
  });
  const row = await owner.treatment.create({
    data: {
      patientId: users[0],
      name: 'Synthetic reminder',
      startDate: date,
      endDate: date,
      status: 'ACTIVE',
      activatedAt: new Date(at.getTime() - 60000),
      medications: {
        create: {
          medicineId,
          dose: 1,
          doseUnit: 'TABLET',
          scheduleType: 'FIXED_TIMES',
          schedules: {
            create: {
              time: new Date(
                '1970-01-01T' + at.toISOString().slice(11, 19) + 'Z',
              ),
              timezone: 'UTC',
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              startDate: date,
              endDate: date,
            },
          },
        },
      },
    },
    include: { medications: { include: { schedules: true } } },
  });
  const occurrence = await owner.medicationOccurrence.create({
    data: {
      patientId: users[0],
      scheduleId: row.medications[0].schedules[0].id,
      localDate: date,
      timezone: 'UTC',
      scheduledAt: at,
    },
  });
  return { row, occurrence };
}
async function waitJob(queue, id) {
  for (let i = 0; i < 100; i++) {
    const job = await queue.getJob(id);
    if (job && ['completed', 'failed'].includes(await job.getState()))
      return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail('Job did not finish');
}
test('recent due reminders are localized, transactional and deduplicated under concurrent delivery', async () => {
  const { row, occurrence } = await fixture(-1, 'AR');
  assert.ok((await delivery.candidates()).some((x) => x.id === occurrence.id));
  assert.deepEqual(
    (
      await Promise.all([
        delivery.deliver(occurrence.id),
        delivery.deliver(occurrence.id),
      ])
    ).sort(),
    ['DELIVERED', 'DUPLICATE'],
  );
  const n = await owner.notification.findUniqueOrThrow({
    where: { occurrenceId: occurrence.id },
  });
  assert.equal(n.title, 'موعد جرعة');
  assert.deepEqual(n.data, {
    treatmentId: row.id,
    occurrenceId: occurrence.id,
  });
  assert.equal(await owner.auditLog.count({ where: { resourceId: n.id } }), 1);
  assert.ok(!(await delivery.candidates()).some((x) => x.id === occurrence.id));
});
test('future and stale occurrences are suppressed without creating missed events', async () => {
  for (const minutes of [10, -10]) {
    const { occurrence } = await fixture(minutes);
    assert.equal(await delivery.deliver(occurrence.id), 'SUPPRESSED');
    assert.ok(
      !(await delivery.candidates()).some((x) => x.id === occurrence.id),
    );
  }
  assert.equal(
    await owner.medicationEvent.count({ where: { patientId: users[0] } }),
    0,
  );
});
test('delivery rechecks consent, account role/status, treatment state and recorded events', async () => {
  const { row, occurrence } = await fixture();
  await owner.notificationPreferences.delete({ where: { userId: users[0] } });
  assert.equal(await delivery.deliver(occurrence.id), 'SUPPRESSED');
  await owner.notificationPreferences.create({
    data: {
      userId: users[0],
      doseReminders: false,
      expiryReminders: false,
      lowStockAlerts: false,
      sharingNotifications: false,
      systemNotifications: false,
    },
  });
  assert.equal(await delivery.deliver(occurrence.id), 'SUPPRESSED');
  await owner.notificationPreferences.update({
    where: { userId: users[0] },
    data: { doseReminders: true },
  });
  for (const data of [
    { role: 'DOCTOR' },
    { role: 'PATIENT', status: 'DISABLED' },
  ]) {
    await owner.user.update({ where: { id: users[0] }, data });
    assert.equal(await delivery.deliver(occurrence.id), 'SUPPRESSED');
  }
  await owner.user.update({
    where: { id: users[0] },
    data: { role: 'PATIENT', status: 'ACTIVE' },
  });
  assert.equal(
    (
      await request('/medication-events', 'POST', {
        occurrenceId: occurrence.id,
        status: 'TAKEN',
      })
    ).status,
    201,
  );
  assert.equal(await delivery.deliver(occurrence.id), 'SUPPRESSED');
  await owner.treatment.update({
    where: { id: row.id },
    data: { status: 'CANCELLED' },
  });
  assert.equal(await delivery.deliver(occurrence.id), 'SUPPRESSED');
});
test('real BullMQ workers deduplicate producers and suppress queued work after opt-out', async () => {
  const q = new ReminderQueue(
    redisUrl.href,
    runtime,
    `reminders-test-${randomUUID()}`,
  );
  try {
    const { occurrence } = await fixture();
    await Promise.all([q.enqueueDue(), q.enqueueDue()]);
    const job = await q.queue.getJob(`dose-${occurrence.id}`);
    assert.deepEqual(job.data, { occurrenceId: occurrence.id });
    q.start();
    assert.equal((await waitJob(q.queue, job.id)).returnvalue, 'DELIVERED');
    const second = await fixture();
    await owner.notificationPreferences.update({
      where: { userId: users[0] },
      data: { doseReminders: false },
    });
    await q.queue.add(
      'dose-due',
      { occurrenceId: second.occurrence.id },
      { jobId: `dose-${second.occurrence.id}` },
    );
    assert.equal(
      (await waitJob(q.queue, `dose-${second.occurrence.id}`)).returnvalue,
      'SUPPRESSED',
    );
  } finally {
    await q.close();
    const cleanup = new ReminderQueue(redisUrl.href, runtime, q.queue.name);
    try {
      await cleanup.queue.obliterate({ force: true });
    } finally {
      await cleanup.close();
    }
  }
});
test('inbox filters and idempotent read mutations preserve owner isolation', async () => {
  const { occurrence } = await fixture();
  await delivery.deliver(occurrence.id);
  const list = await request('/notifications?unread=true');
  assert.equal(list.status, 200);
  assert.equal(list.body.meta.total, 1);
  const id = list.body.data[0].id;
  assert.equal(
    (await request('/notifications', 'GET', undefined, tokens[1])).body.meta
      .total,
    0,
  );
  assert.equal(
    (await request(`/notifications/${id}/read`, 'PATCH', {}, tokens[1])).status,
    404,
  );
  assert.equal(
    (await request(`/notifications/${id}/read`, 'PATCH', {})).body.data
      .updatedCount,
    1,
  );
  assert.equal(
    (await request(`/notifications/${id}/read`, 'PATCH', {})).body.data
      .updatedCount,
    0,
  );
  assert.equal(
    (await request('/notifications/read-all', 'PATCH', {})).body.data
      .updatedCount,
    0,
  );
  assert.equal(
    (await request('/notifications?unread=true')).body.meta.total,
    0,
  );
  assert.equal(
    (await request('/notifications?unread=false')).body.meta.total,
    1,
  );
  for (const query of ['unread=1', 'limit=101', 'page=0', 'userId=' + users[1]])
    assert.equal((await request('/notifications?' + query)).status, 400);
  assert.equal(
    (await request('/notifications', 'GET', undefined, null)).status,
    401,
  );
});
test('audit failure rolls back delivery and read state; runtime cannot rewrite content or ownership', async () => {
  const { occurrence } = await fixture();
  await owner.$executeRawUnsafe(
    'REVOKE INSERT ON audit_logs FROM saydaliyati_app',
  );
  try {
    await assert.rejects(delivery.deliver(occurrence.id));
  } finally {
    await owner.$executeRawUnsafe(
      'GRANT INSERT ON audit_logs TO saydaliyati_app',
    );
  }
  assert.equal(
    await owner.notification.count({ where: { userId: users[0] } }),
    0,
  );
  await delivery.deliver(occurrence.id);
  const n = await owner.notification.findUniqueOrThrow({
    where: { occurrenceId: occurrence.id },
  });
  await owner.$executeRawUnsafe(
    'REVOKE INSERT ON audit_logs FROM saydaliyati_app',
  );
  try {
    assert.equal(
      (await request(`/notifications/${n.id}/read`, 'PATCH', {})).status,
      500,
    );
  } finally {
    await owner.$executeRawUnsafe(
      'GRANT INSERT ON audit_logs TO saydaliyati_app',
    );
  }
  assert.equal(
    (await owner.notification.findUniqueOrThrow({ where: { id: n.id } }))
      .readAt,
    null,
  );
  for (const data of [{ title: 'changed' }, { userId: users[1] }])
    await assert.rejects(
      runtime.notification.update({ where: { id: n.id }, data }),
    );
  await assert.rejects(runtime.notification.delete({ where: { id: n.id } }));
  await assert.rejects(
    owner.notification.update({
      where: { id: n.id },
      data: { userId: users[1] },
    }),
  );
});

test('queue failures retry within the bound and persist only a generic error', async () => {
  const db = {
    $transaction: async () => {
      throw new Error('synthetic private SQL detail');
    },
  };
  const q = new ReminderQueue(
    redisUrl.href,
    db,
    `reminders-test-${randomUUID()}`,
  );
  try {
    const job = await q.queue.add(
      'dose-due',
      { occurrenceId: randomUUID() },
      { attempts: 2, backoff: { type: 'fixed', delay: 20 } },
    );
    q.start();
    const finished = await waitJob(q.queue, job.id);
    assert.equal(await finished.getState(), 'failed');
    assert.equal(finished.attemptsMade, 2);
    assert.equal(finished.failedReason, 'Reminder processing failed.');
    assert.ok(
      !JSON.stringify(finished.toJSON()).includes(
        'synthetic private SQL detail',
      ),
    );
  } finally {
    await q.close();
    const cleanup = new ReminderQueue(redisUrl.href, runtime, q.queue.name);
    try {
      await cleanup.queue.obliterate({ force: true });
    } finally {
      await cleanup.close();
    }
  }
});
