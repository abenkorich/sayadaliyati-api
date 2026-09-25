import { Temporal } from '@js-temporal/polyfill';
import type { TreatmentCreateInput } from '@saydaliyati/validation';
import { ApiError } from '../auth/errors.js';
export function localToday(timezone: string, now = new Date()) {
  return Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}
export function scheduleDates(
  schedule: TreatmentCreateInput['medications'][number]['schedules'][number],
  timezone: string,
) {
  const result: { localDate: string; scheduledAt: Date }[] = [];
  for (
    let date = Temporal.PlainDate.from(schedule.startDate);
    Temporal.PlainDate.compare(date, schedule.endDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    if (!schedule.daysOfWeek.includes(date.dayOfWeek % 7)) continue;
    try {
      const time = Temporal.PlainTime.from(schedule.time);
      const zoned = date
        .toPlainDateTime(time)
        .toZonedDateTime(timezone, { disambiguation: 'reject' });
      result.push({
        localDate: date.toString(),
        scheduledAt: new Date(zoned.epochMilliseconds),
      });
    } catch {
      throw new ApiError('SCHEDULE_TIME_INVALID');
    }
  }
  return result;
}
export function validateSchedules(
  input: TreatmentCreateInput,
  timezone: string,
) {
  let count = 0;
  for (const medication of input.medications) {
    const seen = new Set<string>();
    for (const schedule of medication.schedules) {
      const dates = scheduleDates(schedule, timezone);
      if (!dates.length) throw new ApiError('VALIDATION_ERROR');
      count += dates.length;
      if (count > 5000) throw new ApiError('VALIDATION_ERROR');
      for (const date of dates) {
        const key = date.scheduledAt.toISOString();
        if (seen.has(key)) throw new ApiError('VALIDATION_ERROR');
        seen.add(key);
      }
    }
  }
}
