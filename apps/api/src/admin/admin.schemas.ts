import { z } from 'zod';
export const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    q: z.string().trim().max(100).default(''),
  })
  .strict();
export const idSchema = z.string().uuid();
export const userPatchSchema = z
  .object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']) })
  .strict();
const optionalText = (max: number) => z.string().trim().max(max).nullable();
export const medicineSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    genericName: optionalText(255),
    strength: optionalText(255),
    dosageForm: optionalText(100),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
    source: z.string().trim().min(1).max(150),
  })
  .strict();
export const directoryKindSchema = z.enum([
  'doctors',
  'pharmacies',
  'hospitals',
]);
export const directorySchema = z
  .object({
    countryId: z.string().uuid().nullable().optional(),
    wilayaId: z.string().uuid().nullable().optional(),
    communeId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(255),
    specialty: optionalText(150),
    licenseNumber: optionalText(150),
    address: optionalText(500),
    city: optionalText(100),
    phone: optionalText(32),
    email: z.union([z.email().max(320), z.literal('')]).nullable(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  })
  .strict();
export const settingsSchema = z
  .object({
    organizationName: z.string().trim().min(1).max(150),
    supportEmail: z.union([z.email().max(320), z.literal('')]).nullable(),
    defaultLanguage: z.enum(['EN', 'FR', 'AR']),
    timezone: z
      .string()
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .strict();
