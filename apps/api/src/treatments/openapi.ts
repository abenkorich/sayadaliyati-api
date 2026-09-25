import type { SchemaObject } from '@nestjs/swagger';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date' };
const instant: SchemaObject = { type: 'string', format: 'date-time' };
const text: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer', minimum: 0 };
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const event = object({
  id: uuid,
  occurrenceId: uuid,
  scheduledAt: instant,
  recordedAt: instant,
  status: { type: 'string', enum: ['TAKEN', 'SKIPPED'] },
  notes: { ...text, nullable: true },
});
const occurrence = object({
  occurrenceId: uuid,
  localDate: date,
  timezone: text,
  scheduledAt: instant,
  eligible: { type: 'boolean' },
  event: {
    ...object({
      id: uuid,
      status: { type: 'string', enum: ['TAKEN', 'SKIPPED'] },
      notes: { ...text, nullable: true },
      recordedAt: instant,
    }),
    nullable: true,
  },
});
const schedule = object({
  id: uuid,
  time: { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' },
  timezone: text,
  daysOfWeek: array({ type: 'integer', minimum: 0, maximum: 6 }),
  startDate: date,
  endDate: date,
  enabled: { type: 'boolean' },
  occurrences: array(occurrence),
});
const medication = object({
  id: uuid,
  medicineId: uuid,
  dose: { type: 'string', description: 'Exact positive decimal' },
  doseUnit: text,
  scheduleType: { type: 'string', enum: ['FIXED_TIMES'] },
  instructions: { ...text, nullable: true },
  schedules: array(schedule),
});
const header = {
  id: uuid,
  prescriptionId: { ...uuid, nullable: true },
  name: text,
  startDate: date,
  endDate: date,
  status: {
    type: 'string',
    enum: ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  },
  activatedAt: { ...instant, nullable: true },
  createdAt: instant,
  updatedAt: instant,
} satisfies Record<string, SchemaObject>;
const detail = object({
  ...header,
  medications: array(medication),
  progress: object({
    scheduled: integer,
    due: integer,
    taken: integer,
    skipped: integer,
    unrecordedDue: integer,
  }),
});
const meta = object({
  page: { type: 'integer', minimum: 1 },
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  total: integer,
  totalPages: integer,
});
export const treatmentResponse = object({ data: detail, meta: object({}) });
export const treatmentListResponse = object({
  data: array(object(header)),
  meta,
});
export const medicationEventResponse = object({
  data: event,
  meta: object({}),
});
export const medicationEventListResponse = object({ data: array(event), meta });
