import { Inject, Injectable } from '@nestjs/common';
import type { NotificationPreferencesPatch } from '@saydaliyati/validation';
import { notificationPreferencesSchema } from '@saydaliyati/validation';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
const selection = {
  doseReminders: true,
  expiryReminders: true,
  lowStockAlerts: true,
  sharingNotifications: true,
  systemNotifications: true,
  expiryLeadDays: true,
} as const;
@Injectable()
export class NotificationPreferencesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async get(actor: AuthContext) {
    const preferences = await this.db.client.notificationPreferences.findUnique(
      { where: { userId: actor.userId }, select: selection },
    );
    return {
      data: { configured: preferences !== null, preferences },
      meta: {},
    };
  }
  async patch(
    actor: AuthContext,
    input: NotificationPreferencesPatch,
    requestId: string,
  ) {
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizeOwnerMutation(tx, actor);
      const current = await tx.notificationPreferences.findUnique({
        where: { userId: actor.userId },
        select: selection,
      });
      const parsed = notificationPreferencesSchema.safeParse({
        ...(current ?? { expiryLeadDays: null }),
        ...input,
      });
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
      const preferences = parsed.data;
      const changed =
        !current ||
        (Object.keys(selection) as (keyof typeof selection)[]).some(
          (key) => current[key] !== preferences[key],
        );
      if (changed) {
        if (current) {
          await tx.notificationPreferences.update({
            where: { userId: actor.userId },
            data: preferences,
            select: { userId: true },
          });
        } else {
          await tx.$executeRaw`INSERT INTO notification_preferences (user_id, dose_reminders, expiry_reminders, low_stock_alerts, sharing_notifications, system_notifications, expiry_lead_days) VALUES (${actor.userId}::uuid, ${preferences.doseReminders}, ${preferences.expiryReminders}, ${preferences.lowStockAlerts}, ${preferences.sharingNotifications}, ${preferences.systemNotifications}, ${preferences.expiryLeadDays})`;
        }
        await tx.auditLog.createMany({
          data: [
            {
              actorId: actor.userId,
              resourceId: actor.userId,
              resourceType: 'NOTIFICATION_PREFERENCES',
              action: current
                ? 'NOTIFICATION_PREFERENCES_UPDATED'
                : 'NOTIFICATION_PREFERENCES_CONFIGURED',
              metadata: { requestId, result: 'SUCCESS' },
            },
          ],
        });
      }
      return { data: { configured: true, preferences }, meta: {} };
    });
  }
}
