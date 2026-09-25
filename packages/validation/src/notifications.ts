import { z } from 'zod';

export const notificationPreferencesSchema = z
  .object({
    doseReminders: z.boolean(),
    expiryReminders: z.boolean(),
    lowStockAlerts: z.boolean(),
    sharingNotifications: z.boolean(),
    systemNotifications: z.boolean(),
    // PostgreSQL INTEGER range; this is a persistence bound, not a reminder policy.
    expiryLeadDays: z.number().int().min(0).max(2147483647).nullable(),
  })
  .strict();
export const notificationPreferencesPatchSchema = notificationPreferencesSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export type NotificationPreferencesPatch = z.infer<
  typeof notificationPreferencesPatchSchema
>;

const page = (max: number, fallback: string) =>
  z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(max));
export const notificationQuerySchema = z
  .object({
    page: page(10000, '1'),
    limit: page(100, '20'),
    unread: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();
export const notificationReadSchema = z.object({}).strict();
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
