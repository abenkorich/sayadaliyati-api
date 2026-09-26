import { z } from 'zod';

// Preserve accents and Arabic characters; never infer transliterations.
export function normalizeCatalogText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
const pageNumber = (maximum: number, fallback: string) =>
  z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().min(1).max(maximum));
export const medicineIdSchema = z.string().uuid();
const filterText = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !value.includes('\u0000'));
export const medicineQuerySchema = z
  .object({
    q: z
      .string()
      .max(200)
      .transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
      .pipe(
        z
          .string()
          .min(1)
          .refine((value) => !value.includes('\u0000')),
      )
      .optional(),
    page: pageNumber(10000, '1'),
    limit: pageNumber(100, '20'),
    category: z
      .union([medicineIdSchema, z.literal('uncategorized')])
      .optional(),
    laboratory: filterText.optional(),
    holderCountry: filterText.optional(),
    dosageForm: filterText.optional(),
    regulatoryStatus: z
      .enum(['CURRENT', 'NOT_RENEWED', 'WITHDRAWN'])
      .optional(),
    barcode: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    ingredient: medicineIdSchema.optional(),
    manufacturer: medicineIdSchema.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  })
  .strict();
// Exact stored text, not a URL to fetch or a numeric value. Preserve leading zeros.
export const barcodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\x21-\x7e]+$/);
export type MedicineQuery = z.infer<typeof medicineQuerySchema>;
