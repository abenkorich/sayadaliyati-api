import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(320).email();
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{1,14}$/);
const name = z.string().trim().min(1).max(100);
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
const language = z.enum(['EN', 'FR', 'AR']);
const boundedPassword = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[\uD800-\uDFFF]/u.test(value))
  .refine((value) => new TextEncoder().encode(value).length <= 512);
export const registrationSchema = z
  .object({
    email: email.optional(),
    phone: phone.optional(),
    password: boundedPassword.refine(
      (value) => [...value].length >= 15 && [...value].length <= 128,
    ),
    firstName: name,
    lastName: name,
    preferredLanguage: language,
    timezone: timezoneSchema,
  })
  .strict()
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    path: ['email'],
  });
export const loginSchema = z
  .object({ identifier: z.union([email, phone]), password: boundedPassword })
  .strict();
export const refreshSchema = z
  .object({ refreshToken: z.string().min(1).max(256) })
  .strict();
export const logoutSchema = z.object({}).strict();
export const profilePatchSchema = z
  .object({
    firstName: name.optional(),
    lastName: name.optional(),
    preferredLanguage: language.optional(),
    timezone: timezoneSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

export {
  barcodeSchema,
  medicineIdSchema,
  medicineQuerySchema,
  normalizeCatalogText,
} from './catalog.js';
export type { MedicineQuery } from './catalog.js';

export {
  calendarDateSchema,
  inventoryQuantitySchema,
  inventoryUnitSchema,
  inventorySourceSchema,
  inventoryCreateSchema,
  inventoryPatchSchema,
  inventoryQuerySchema,
  inventoryIdSchema,
} from './inventory.js';
export type {
  InventoryCreateInput,
  InventoryPatchInput,
  InventoryQuery,
} from './inventory.js';

export {
  prescriptionCreateSchema,
  prescriptionReviewSchema,
  prescriptionQuerySchema,
  prescriptionMedicationSchema,
  prescriptionFieldSchemas,
  prescriptionFieldNames,
} from './prescriptions.js';
export type {
  PrescriptionCreateInput,
  PrescriptionMedicationInput,
  PrescriptionReviewInput,
  PrescriptionQuery,
  PrescriptionFieldName,
} from './prescriptions.js';

export {
  notificationPreferencesSchema,
  notificationPreferencesPatchSchema,
} from './notifications.js';
export type { NotificationPreferencesPatch } from './notifications.js';
export {
  treatmentCreateSchema,
  treatmentStateSchema,
  treatmentQuerySchema,
  treatmentScheduleSchema,
  medicationEventCreateSchema,
  medicationEventQuerySchema,
} from './treatments.js';
export type {
  TreatmentCreateInput,
  TreatmentQuery,
  MedicationEventInput,
  MedicationEventQuery,
} from './treatments.js';
export {
  notificationQuerySchema,
  notificationReadSchema,
} from './notifications.js';
export type { NotificationQuery } from './notifications.js';
