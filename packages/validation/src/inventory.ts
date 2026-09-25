import { z } from 'zod';
import { medicineIdSchema, normalizeCatalogText } from './catalog.js';

export const inventoryUnitSchema = z.enum([
  'TABLET',
  'CAPSULE',
  'ML',
  'MG',
  'G',
  'DOSE',
  'SACHET',
  'AMPOULE',
  'VIAL',
  'SUPPOSITORY',
  'DROP',
  'PATCH',
  'OTHER',
]);
export const inventorySourceSchema = z.enum([
  'MANUAL',
  'SCAN',
  'PRESCRIPTION',
  'IMPORT',
  'OTHER',
]);
// Require an actual calendar date. Do not let JavaScript roll February 30 into March.
export const calendarDateSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  });
export const inventoryQuantitySchema = z
  .number()
  .finite()
  .min(0)
  .max(999999999.999)
  .refine(
    (value) => /^\d+(?:\.\d{1,3})?$/.test(String(value)),
    'Use at most three decimal places.',
  );
const text = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !value.includes('\u0000'));
const mutable = {
  quantity: inventoryQuantitySchema,
  unit: inventoryUnitSchema,
  batchNumber: text(100).nullable().optional(),
  expiryDate: calendarDateSchema.nullable().optional(),
  purchaseDate: calendarDateSchema.nullable().optional(),
  storageLocation: text(150).nullable().optional(),
  source: inventorySourceSchema.nullable().optional(),
  notes: text(4000).nullable().optional(),
  lowStockThreshold: inventoryQuantitySchema.nullable().optional(),
};
export const inventoryCreateSchema = z
  .object({ medicineId: medicineIdSchema, ...mutable })
  .strict();
export const inventoryPatchSchema = z
  .object(mutable)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const page = (maximum: number, fallback: string) =>
  z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().min(1).max(maximum));
export const inventoryQuerySchema = z
  .object({
    q: text(200).transform(normalizeCatalogText).optional(),
    // Inventory status means unarchived, not medicine status or an expiry diagnosis.
    status: z.literal('ACTIVE').default('ACTIVE'),
    expiryBefore: calendarDateSchema.optional(),
    lowStock: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    medicineId: medicineIdSchema.optional(),
    page: page(10000, '1'),
    limit: page(100, '20'),
    sort: z
      .enum(['expiry_asc', 'name_asc', 'created_desc'])
      .default('created_desc'),
  })
  .strict();
export const inventoryIdSchema = medicineIdSchema;
export type InventoryCreateInput = z.infer<typeof inventoryCreateSchema>;
export type InventoryPatchInput = z.infer<typeof inventoryPatchSchema>;
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
