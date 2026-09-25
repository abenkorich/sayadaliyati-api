import { z } from 'zod';
import { medicineIdSchema } from './catalog.js';
import { calendarDateSchema, inventoryQuantitySchema } from './inventory.js';
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes('\u0000'));
const positive = z
  .number()
  .finite()
  .gt(0)
  .max(99999999.9999)
  .refine((value) => /^\d+(?:\.\d{1,4})?$/.test(String(value)));
export const prescriptionFieldSchemas = {
  medicineId: medicineIdSchema.nullable(),
  extractedName: text(255).nullable(),
  strength: text(100).nullable(),
  dosage: positive.nullable(),
  dosageUnit: text(50).nullable(),
  frequency: positive.nullable(),
  frequencyUnit: text(50).nullable(),
  duration: positive.nullable(),
  durationUnit: text(50).nullable(),
  quantity: inventoryQuantitySchema.gt(0).nullable(),
  instructions: text(4000).nullable(),
  scheduledTimes: z
    .array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/))
    .min(1)
    .max(24)
    .refine((values) => new Set(values).size === values.length)
    .nullable(),
  startDate: calendarDateSchema.nullable(),
  endDate: calendarDateSchema.nullable(),
};
export type PrescriptionFieldName = keyof typeof prescriptionFieldSchemas;
export const prescriptionFieldNames = Object.keys(
  prescriptionFieldSchemas,
) as PrescriptionFieldName[];
export const prescriptionMedicationSchema = z
  .object({
    medicineId: prescriptionFieldSchemas.medicineId.default(null),
    extractedName: prescriptionFieldSchemas.extractedName.default(null),
    strength: prescriptionFieldSchemas.strength.default(null),
    dosage: prescriptionFieldSchemas.dosage.default(null),
    dosageUnit: prescriptionFieldSchemas.dosageUnit.default(null),
    frequency: prescriptionFieldSchemas.frequency.default(null),
    frequencyUnit: prescriptionFieldSchemas.frequencyUnit.default(null),
    duration: prescriptionFieldSchemas.duration.default(null),
    durationUnit: prescriptionFieldSchemas.durationUnit.default(null),
    quantity: prescriptionFieldSchemas.quantity.default(null),
    instructions: prescriptionFieldSchemas.instructions.default(null),
    scheduledTimes: prescriptionFieldSchemas.scheduledTimes.default(null),
    startDate: prescriptionFieldSchemas.startDate.default(null),
    endDate: prescriptionFieldSchemas.endDate.default(null),
  })
  .strict()
  .refine((value) => value.medicineId !== null || value.extractedName !== null)
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
  );
export const prescriptionCreateSchema = z
  .object({
    // Professional identity verification is not implemented; do not accept an unverified link.
    doctorId: z.null().optional(),
    prescriptionDate: calendarDateSchema.nullable().default(null),
    validUntil: calendarDateSchema.nullable().default(null),
    source: z.literal('MANUAL').default('MANUAL'),
    medications: z.array(prescriptionMedicationSchema).min(1).max(50),
  })
  .strict()
  .refine(
    (value) =>
      !value.prescriptionDate ||
      !value.validUntil ||
      value.validUntil >= value.prescriptionDate,
  );
export const prescriptionReviewSchema = z
  .object({
    fieldReviews: z
      .array(
        z
          .object({
            fieldId: medicineIdSchema,
            value: z.union([
              z.string().max(4000),
              z.number().finite(),
              z.array(z.string().max(5)).max(24),
              z.null(),
            ]),
            confirmed: z.boolean(),
          })
          .strict(),
      )
      .max(100)
      .refine(
        (rows) => new Set(rows.map((row) => row.fieldId)).size === rows.length,
      )
      .optional(),
    rejectedMedicationIds: z
      .array(medicineIdSchema)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    confirmationFieldIds: z
      .array(medicineIdSchema)
      .min(1)
      .max(700)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    status: z.enum(['ARCHIVED', 'CONFIRMED']).optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.fieldReviews?.length ?? 0) > 0 ||
      (value.rejectedMedicationIds?.length ?? 0) > 0 ||
      value.status === 'ARCHIVED' ||
      value.status === 'CONFIRMED',
  )
  .refine((value) =>
    value.status === undefined
      ? !value.confirmationFieldIds
      : !(value.fieldReviews?.length || value.rejectedMedicationIds?.length) &&
        (value.status === 'CONFIRMED'
          ? !!value.confirmationFieldIds
          : !value.confirmationFieldIds),
  );
const page = (max: number, fallback: string) =>
  z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().min(1).max(max));
export const prescriptionQuerySchema = z
  .object({
    page: page(10000, '1'),
    limit: page(100, '20'),
    status: z.enum(['DRAFT', 'CONFIRMED', 'ARCHIVED']).optional(),
  })
  .strict();
export type PrescriptionCreateInput = z.infer<typeof prescriptionCreateSchema>;
export type PrescriptionMedicationInput = z.infer<
  typeof prescriptionMedicationSchema
>;
export type PrescriptionReviewInput = z.infer<typeof prescriptionReviewSchema>;
export type PrescriptionQuery = z.infer<typeof prescriptionQuerySchema>;
