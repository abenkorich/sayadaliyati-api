import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { Redis } from 'ioredis';
import { createDatabaseClient } from '@saydaliyati/database';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';
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
const day = (offset) =>
    new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10),
  weekdays = [0, 1, 2, 3, 4, 5, 6];
const body = () => ({
  name: 'Synthetic course',
  startDate: day(1),
  endDate: day(2),
  medications: [
    {
      medicineId,
      dose: 1,
      doseUnit: 'TABLET',
      scheduleType: 'FIXED_TIMES',
      schedules: [
        {
          time: '08:00',
          daysOfWeek: weekdays,
          startDate: day(1),
          endDate: day(2),
        },
      ],
    },
  ],
});
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
async function create(input = body(), token = tokens[0]) {
  const r = await request('/treatments', 'POST', input, token);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data;
}
async function cleanup() {
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
async function reviewed() {
  let result = await request('/prescriptions', 'POST', {
    medications: [
      {
        medicineId,
        dosage: 1,
        dosageUnit: 'TABLET',
        scheduledTimes: ['08:00'],
        startDate: day(1),
        endDate: day(2),
      },
    ],
  });
  assert.equal(result.status, 201);
  const id = result.body.data.id;
  result = await request(`/prescriptions/${id}`, 'PATCH', {
    fieldReviews: result.body.data.medications[0].fields.map((f) => ({
      fieldId: f.id,
      value: f.value,
      confirmed: true,
    })),
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.data;
}
async function dueFixture() {
  const row = await owner.treatment.create({
    data: {
      patientId: users[0],
      name: 'Synthetic past fixture',
      startDate: new Date(day(-1)),
      endDate: new Date(day(1)),
      status: 'ACTIVE',
      activatedAt: new Date(Date.now() - 86400000),
      medications: {
        create: {
          medicineId,
          dose: 1,
          doseUnit: 'TABLET',
          scheduleType: 'FIXED_TIMES',
          schedules: {
            create: {
              time: new Date('1970-01-01T08:00:00Z'),
              timezone: 'UTC',
              daysOfWeek: weekdays,
              startDate: new Date(day(-1)),
              endDate: new Date(day(1)),
            },
          },
        },
      },
    },
    include: { medications: { include: { schedules: true } } },
  });
  const schedule = row.medications[0].schedules[0];
  const occurrence = await owner.medicationOccurrence.create({
    data: {
      patientId: users[0],
      scheduleId: schedule.id,
      localDate: new Date(day(-1)),
      timezone: 'UTC',
      scheduledAt: new Date(`${day(-1)}T08:00:00Z`),
    },
  });
  return { row, occurrence, schedule };
}
test('planned creation captures timezone; explicit activation creates stable future occurrences exactly once', async () => {
  const row = await create();
  assert.equal(row.status, 'PLANNED');
  assert.equal(row.progress.scheduled, 0);
  await owner.patientProfile.update({
    where: { userId: users[0] },
    data: { timezone: 'Asia/Tokyo' },
  });
  const results = await Promise.all([
    request(`/treatments/${row.id}`, 'PATCH', { status: 'ACTIVE' }),
    request(`/treatments/${row.id}`, 'PATCH', { status: 'ACTIVE' }, tokens[2]),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  const occurrences =
    results[0].body.data.medications[0].schedules[0].occurrences;
  assert.equal(occurrences.length, 2);
  assert.equal(occurrences[0].timezone, 'UTC');
  assert.equal(occurrences[0].scheduledAt, `${day(1)}T08:00:00.000Z`);
  assert.deepEqual(
    results[1].body.data.medications[0].schedules[0].occurrences,
    occurrences,
  );
  assert.equal(
    (
      await request('/medication-events', 'POST', {
        occurrenceId: occurrences[0].occurrenceId,
        status: 'TAKEN',
      })
    ).status,
    409,
  );
  assert.equal(
    await owner.auditLog.count({
      where: { resourceId: row.id, action: 'TREATMENT_ACTIVE' },
    }),
    1,
  );
});
test('prescription confirmation requires current explicit field reviews and exact treatment transcription', async () => {
  const p = await reviewed(),
    confirmationFieldIds = p.medications[0].fields.map((f) => f.id);
  assert.equal(
    (await request('/treatments', 'POST', { ...body(), prescriptionId: p.id }))
      .status,
    409,
  );
  assert.equal(
    (
      await request(`/prescriptions/${p.id}`, 'PATCH', {
        status: 'CONFIRMED',
        confirmationFieldIds: [randomUUID()],
      })
    ).status,
    409,
  );
  const confirmed = await request(`/prescriptions/${p.id}`, 'PATCH', {
    status: 'CONFIRMED',
    confirmationFieldIds,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.data.status, 'CONFIRMED');
  assert.equal(
    confirmed.body.data.medications[0].confirmationStatus,
    'CONFIRMED',
  );
  assert.equal(
    (
      await request(`/prescriptions/${p.id}`, 'PATCH', {
        status: 'CONFIRMED',
        confirmationFieldIds,
      })
    ).status,
    200,
  );
  const row = await create({ ...body(), prescriptionId: p.id });
  const bad = body();
  bad.medications[0].dose = 2;
  assert.equal(
    (await request('/treatments', 'POST', { ...bad, prescriptionId: p.id }))
      .status,
    409,
  );
  assert.equal(
    await owner.auditLog.count({
      where: { resourceId: p.id, action: 'PRESCRIPTION_CONFIRMED' },
    }),
    1,
  );
  await request(`/prescriptions/${p.id}`, 'DELETE');
  assert.equal(
    (await request(`/treatments/${row.id}`, 'PATCH', { status: 'ACTIVE' }))
      .status,
    409,
  );
});
test('incomplete reviewed lines cannot be confirmed and stale snapshots cannot finalize later edits', async () => {
  const r = await request('/prescriptions', 'POST', {
    medications: [{ medicineId }],
  });
  const p = r.body.data;
  const reviewed = await request(`/prescriptions/${p.id}`, 'PATCH', {
    fieldReviews: p.medications[0].fields.map((f) => ({
      fieldId: f.id,
      value: f.value,
      confirmed: true,
    })),
  });
  const ids = reviewed.body.data.medications[0].fields.map((f) => f.id);
  assert.equal(
    (
      await request(`/prescriptions/${p.id}`, 'PATCH', {
        status: 'CONFIRMED',
        confirmationFieldIds: ids,
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/prescriptions/${p.id}`)).body.data.status,
    'DRAFT',
  );
});
test('owner and patient-role boundaries protect treatments, state changes and event history', async () => {
  const row = await create();
  for (const [method, payload] of [
    ['GET', undefined],
    ['PATCH', { status: 'ACTIVE' }],
  ])
    assert.equal(
      (await request(`/treatments/${row.id}`, method, payload, tokens[1]))
        .status,
      404,
    );
  assert.equal(
    (await request('/treatments', 'GET', undefined, tokens[1])).body.meta.total,
    0,
  );
  assert.equal(
    (await request('/treatments', 'POST', body(), null)).status,
    401,
  );
  await owner.user.update({
    where: { id: users[0] },
    data: { role: 'DOCTOR' },
  });
  assert.equal((await request('/treatments')).status, 403);
  assert.equal((await request('/medication-events')).status, 403);
});
test('taken/skipped records are immutable, owner-scoped and deduplicated across concurrent sessions', async () => {
  const { row, occurrence } = await dueFixture();
  const payload = {
    occurrenceId: occurrence.id,
    status: 'TAKEN',
    notes: 'Synthetic record',
  };
  assert.equal(
    (await request('/medication-events', 'POST', payload, tokens[1])).status,
    404,
  );
  const results = await Promise.all([
    request('/medication-events', 'POST', payload),
    request('/medication-events', 'POST', payload, tokens[2]),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201],
  );
  assert.deepEqual(results[0].body, results[1].body);
  assert.equal(
    (
      await request('/medication-events', 'POST', {
        ...payload,
        status: 'SKIPPED',
      })
    ).status,
    409,
  );
  assert.equal(
    (await request('/medication-events', 'POST', { ...payload, notes: null }))
      .status,
    409,
  );
  assert.equal(
    (await request(`/treatments/${row.id}`)).body.data.progress.taken,
    1,
  );
  assert.equal(
    (await request(`/medication-events?treatmentId=${row.id}`)).body.meta.total,
    1,
  );
  assert.equal(
    (
      await request(
        `/medication-events?treatmentId=${row.id}`,
        'GET',
        undefined,
        tokens[1],
      )
    ).body.meta.total,
    0,
  );
  await request(`/treatments/${row.id}`, 'PATCH', { status: 'COMPLETED' });
  assert.equal(
    (await request('/medication-events', 'POST', payload)).status,
    201,
  );
  assert.equal(
    await owner.auditLog.count({
      where: { resourceId: results[0].body.data.id },
    }),
    1,
  );
});
test('terminal state changes stop new events and cannot rewrite or resume historical schedules', async () => {
  const { row, occurrence } = await dueFixture();
  assert.equal(
    (await request(`/treatments/${row.id}`, 'PATCH', { status: 'CANCELLED' }))
      .status,
    200,
  );
  assert.equal(
    (
      await request('/medication-events', 'POST', {
        occurrenceId: occurrence.id,
        status: 'SKIPPED',
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/treatments/${row.id}`, 'PATCH', { status: 'ACTIVE' }))
      .status,
    409,
  );
  assert.equal(
    (await request(`/treatments/${row.id}`, 'PATCH', { startDate: day(2) }))
      .status,
    400,
  );
  assert.equal(
    (await request(`/treatments/${row.id}`, 'PATCH', { status: 'PAUSED' }))
      .status,
    400,
  );
});
test('audit failures roll back activation, occurrence creation and dose events', async () => {
  const plan = await create(),
    { occurrence } = await dueFixture();
  await owner.$executeRawUnsafe(
    'REVOKE INSERT ON audit_logs FROM saydaliyati_app',
  );
  try {
    assert.equal(
      (await request(`/treatments/${plan.id}`, 'PATCH', { status: 'ACTIVE' }))
        .status,
      500,
    );
    assert.equal(
      (
        await request('/medication-events', 'POST', {
          occurrenceId: occurrence.id,
          status: 'TAKEN',
        })
      ).status,
      500,
    );
    assert.equal((await request('/treatments', 'POST', body())).status, 500);
  } finally {
    await owner.$executeRawUnsafe(
      'GRANT INSERT ON audit_logs TO saydaliyati_app',
    );
  }
  assert.equal(
    (await request(`/treatments/${plan.id}`)).body.data.status,
    'PLANNED',
  );
  assert.equal(
    await owner.medicationOccurrence.count({
      where: { schedule: { medication: { treatmentId: plan.id } } },
    }),
    0,
  );
  assert.equal(
    await owner.medicationEvent.count({
      where: { occurrenceId: occurrence.id },
    }),
    0,
  );
});
test('runtime cannot rewrite schedules/events and database scope checks reject cross-owner occurrences', async () => {
  const { row, occurrence, schedule } = await dueFixture();
  await assert.rejects(
    runtime.medicationSchedule.update({
      where: { id: schedule.id },
      data: { timezone: 'Asia/Tokyo' },
    }),
  );
  await assert.rejects(
    runtime.medicationOccurrence.update({
      where: { id: occurrence.id },
      data: { scheduledAt: new Date() },
    }),
  );
  await assert.rejects(runtime.treatment.delete({ where: { id: row.id } }));
  await assert.rejects(
    owner.medicationOccurrence.create({
      data: {
        patientId: users[1],
        scheduleId: schedule.id,
        localDate: new Date(day(0)),
        timezone: 'UTC',
        scheduledAt: new Date(`${day(0)}T08:00:00Z`),
      },
    }),
  );
  const r = await request('/medication-events', 'POST', {
    occurrenceId: occurrence.id,
    status: 'SKIPPED',
  });
  assert.equal(r.status, 201);
  await assert.rejects(
    runtime.medicationEvent.update({
      where: { id: r.body.data.id },
      data: { status: 'TAKEN' },
    }),
  );
  await assert.rejects(
    runtime.medicationEvent.delete({ where: { id: r.body.data.id } }),
  );
});

test('confirmation audit failure preserves the draft and cannot partially confirm medication summaries', async () => {
  const p = await reviewed(),
    confirmationFieldIds = p.medications[0].fields.map((f) => f.id);
  await owner.$executeRawUnsafe(
    'REVOKE INSERT ON audit_logs FROM saydaliyati_app',
  );
  try {
    assert.equal(
      (
        await request(`/prescriptions/${p.id}`, 'PATCH', {
          status: 'CONFIRMED',
          confirmationFieldIds,
        })
      ).status,
      500,
    );
  } finally {
    await owner.$executeRawUnsafe(
      'GRANT INSERT ON audit_logs TO saydaliyati_app',
    );
  }
  const current = (await request(`/prescriptions/${p.id}`)).body.data;
  assert.equal(current.status, 'DRAFT');
  assert.equal(current.medications[0].confirmationStatus, 'PENDING');
});
test('HTTP scheduling rejects overlapping or DST-invalid times before any rows commit', async () => {
  const input = body();
  input.medications[0].schedules.push(input.medications[0].schedules[0]);
  assert.equal((await request('/treatments', 'POST', input)).status, 400);
  await owner.patientProfile.update({
    where: { userId: users[0] },
    data: { timezone: 'America/New_York' },
  });
  const dst = { ...body(), startDate: '2030-03-10', endDate: '2030-03-10' };
  dst.medications[0].schedules = [
    {
      time: '02:30',
      daysOfWeek: weekdays,
      startDate: dst.startDate,
      endDate: dst.endDate,
    },
  ];
  const r = await request('/treatments', 'POST', dst);
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'SCHEDULE_TIME_INVALID');
  assert.equal(
    await owner.treatment.count({ where: { patientId: users[0] } }),
    0,
  );
});
test('unrecorded past doses are not marked MISSED, and clients cannot fabricate derived event fields', async () => {
  const { row, occurrence } = await dueFixture();
  const detail = (await request(`/treatments/${row.id}`)).body.data;
  assert.equal(detail.progress.unrecordedDue, 1);
  assert.equal(detail.medications[0].schedules[0].occurrences[0].event, null);
  for (const payload of [
    { occurrenceId: occurrence.id, status: 'MISSED' },
    { occurrenceId: occurrence.id, status: 'TAKEN', patientId: users[1] },
    {
      occurrenceId: occurrence.id,
      status: 'TAKEN',
      scheduledAt: new Date().toISOString(),
    },
  ])
    assert.equal(
      (await request('/medication-events', 'POST', payload)).status,
      400,
    );
});
