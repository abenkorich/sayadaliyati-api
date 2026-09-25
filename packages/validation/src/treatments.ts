import { z } from 'zod';
import { calendarDateSchema } from './inventory.js';
import { medicineIdSchema } from './catalog.js';
import { prescriptionFieldSchemas } from './prescriptions.js';
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !v.includes('\0'));
export const treatmentScheduleSchema = z
  .object({
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
  })
  .strict()
  .refine((v) => v.startDate <= v.endDate);
export const treatmentCreateSchema = z
  .object({
    prescriptionId: medicineIdSchema.nullable().default(null),
    name: text(255),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    medications: z
      .array(
        z
          .object({
            medicineId: medicineIdSchema,
            dose: prescriptionFieldSchemas.dosage.unwrap(),
            doseUnit: text(50),
            scheduleType: z.literal('FIXED_TIMES'),
            instructions: text(4000).nullable().default(null),
            schedules: z.array(treatmentScheduleSchema).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine((v) => v.startDate <= v.endDate)
  .refine(
    (v) =>
      new Set(v.medications.map((m) => m.medicineId)).size ===
      v.medications.length,
  )
  .refine((v) =>
    v.medications.every((m) =>
      m.schedules.every(
        (s) => s.startDate >= v.startDate && s.endDate <= v.endDate,
      ),
    ),
  )
  .refine(
    (v) => (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000 < 366,
  );
export const treatmentStateSchema = z
  .object({ status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']) })
  .strict();
const page = (max: number, fallback: string) =>
  z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(max));
export const treatmentQuerySchema = z
  .object({
    page: page(10000, '1'),
    limit: page(100, '20'),
    status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  })
  .strict();
export const medicationEventCreateSchema = z
  .object({
    occurrenceId: medicineIdSchema,
    status: z.enum(['TAKEN', 'SKIPPED']),
    notes: text(2000).nullable().default(null),
  })
  .strict();
export const medicationEventQuerySchema = z
  .object({
    page: page(10000, '1'),
    limit: page(100, '20'),
    treatmentId: medicineIdSchema.optional(),
    treatmentMedicationId: medicineIdSchema.optional(),
    status: z.enum(['TAKEN', 'SKIPPED']).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to));
export type TreatmentCreateInput = z.infer<typeof treatmentCreateSchema>;
export type TreatmentQuery = z.infer<typeof treatmentQuerySchema>;
export type MedicationEventInput = z.infer<typeof medicationEventCreateSchema>;
export type MedicationEventQuery = z.infer<typeof medicationEventQuerySchema>;
