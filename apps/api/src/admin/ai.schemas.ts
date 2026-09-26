import { z } from 'zod';
const rate = z.number().finite().min(0).max(10000).nullable();
export const aiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    model: z
      .string()
      .regex(/^[a-zA-Z0-9._:-]{1,120}$/)
      .nullable(),
    inputRate: rate,
    cachedInputRate: rate,
    outputRate: rate,
    monthlyBudget: z.number().finite().min(0).max(1000000).nullable(),
  })
  .strict()
  .refine(
    (v) =>
      v.cachedInputRate === null ||
      (v.inputRate !== null && v.cachedInputRate <= v.inputRate),
  );
export const aiQuerySchema = z
  .object({
    days: z.enum(['7', '30', '90']).default('30'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    feature: z.enum(['PRESCRIPTION', 'MEDICINE_BOX']).optional(),
    status: z.enum(['STARTED', 'SUCCEEDED', 'FAILED']).optional(),
  })
  .strict();
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;
export type AiQuery = z.infer<typeof aiQuerySchema>;
