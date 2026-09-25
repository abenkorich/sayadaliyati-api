import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  treatmentCreateSchema,
  medicationEventCreateSchema,
} from '@saydaliyati/validation';
import {
  scheduleDates,
  validateSchedules,
} from '../src/treatments/scheduling.js';
const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
test('fixed local times preserve wall-clock time across DST without changing occurrence dates', () => {
  const result = scheduleDates(
    {
      time: '08:00',
      daysOfWeek,
      startDate: '2030-03-09',
      endDate: '2030-03-11',
    },
    'America/New_York',
  );
  assert.deepEqual(
    result.map((x) => x.scheduledAt.toISOString()),
    [
      '2030-03-09T13:00:00.000Z',
      '2030-03-10T12:00:00.000Z',
      '2030-03-11T12:00:00.000Z',
    ],
  );
  assert.deepEqual(
    result.map((x) => x.localDate),
    ['2030-03-09', '2030-03-10', '2030-03-11'],
  );
});
test('DST gaps and folds are rejected instead of choosing an offset or moving a dose', () => {
  for (const [date, time] of [
    ['2030-03-10', '02:30'],
    ['2030-11-03', '01:30'],
  ])
    assert.throws(
      () =>
        scheduleDates(
          { time: time!, daysOfWeek, startDate: date!, endDate: date! },
          'America/New_York',
        ),
      { code: 'SCHEDULE_TIME_INVALID' },
    );
});
test('weekday masks and fractional-hour timezones are resolved exactly', () => {
  const result = scheduleDates(
    {
      time: '08:15',
      daysOfWeek: [0],
      startDate: '2030-03-09',
      endDate: '2030-03-11',
    },
    'Asia/Kathmandu',
  );
  assert.equal(result.length, 1);
  assert.equal(
    result[0]?.scheduledAt.toISOString(),
    '2030-03-10T02:30:00.000Z',
  );
});
test('treatments reject unknown modes, nonpositive doses, schedule overlap and inferred events', () => {
  const body = {
    name: 'Synthetic',
    startDate: '2030-03-09',
    endDate: '2030-03-11',
    medications: [
      {
        medicineId: 'e0000000-0000-4000-8000-000000000001',
        dose: 1,
        doseUnit: 'TABLET',
        scheduleType: 'FIXED_TIMES',
        schedules: [
          {
            time: '08:00',
            daysOfWeek,
            startDate: '2030-03-09',
            endDate: '2030-03-11',
          },
        ],
      },
    ],
  };
  const parsed = treatmentCreateSchema.parse(body);
  validateSchedules(parsed, 'Africa/Algiers');
  const line = parsed.medications[0]!;
  line.schedules.push(line.schedules[0]!);
  assert.throws(() => validateSchedules(parsed, 'Africa/Algiers'), {
    code: 'VALIDATION_ERROR',
  });
  for (const value of [
    { ...body, status: 'ACTIVE' },
    { ...body, endDate: '2032-01-01' },
    { ...body, patientId: 'owner' },
    { ...body, medications: [{ ...body.medications[0], dose: 0 }] },
  ])
    assert.equal(treatmentCreateSchema.safeParse(value).success, false);
  assert.equal(
    medicationEventCreateSchema.safeParse({
      occurrenceId: body.medications[0]!.medicineId,
      status: 'MISSED',
    }).success,
    false,
  );
});
