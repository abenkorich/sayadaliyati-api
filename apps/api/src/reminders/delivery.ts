import type { PrismaClient } from '@saydaliyati/database';
import { medicineIdSchema } from '@saydaliyati/validation';

export const REMINDER_WINDOW_MS = 5 * 60 * 1000;
export const POLL_INTERVAL_MS = 10000;
export const CANDIDATE_LIMIT = 100;
export const reminderText = {
  EN: {
    title: 'Scheduled dose',
    body: 'A dose is scheduled. Open your treatment to review the instructions.',
  },
  FR: {
    title: 'Prise prévue',
    body: 'Une prise est prévue. Ouvrez votre traitement pour consulter les instructions.',
  },
  AR: {
    title: 'موعد جرعة',
    body: 'حان موعد جرعة مجدولة. افتح علاجك لمراجعة التعليمات.',
  },
} as const;
export class ReminderDelivery {
  constructor(private readonly db: PrismaClient) {}
  async candidates() {
    return this.db.$queryRaw<{ id: string }[]>`
      SELECT o.id FROM medication_occurrences o
      JOIN medication_schedules s ON s.id=o.schedule_id
      JOIN treatment_medications m ON m.id=s.treatment_medication_id
      JOIN treatments t ON t.id=m.treatment_id
      JOIN users u ON u.id=o.patient_id
      JOIN notification_preferences p ON p.user_id=u.id
      WHERE o.scheduled_at BETWEEN clock_timestamp() - INTERVAL '5 minutes' AND clock_timestamp()
        AND u.status='ACTIVE' AND u.role='PATIENT' AND p.dose_reminders
        AND t.patient_id=u.id AND t.status='ACTIVE' AND s.enabled
        AND NOT EXISTS (SELECT 1 FROM medication_events e WHERE e.occurrence_id=o.id)
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.occurrence_id=o.id)
      ORDER BY o.scheduled_at,o.id LIMIT ${CANDIDATE_LIMIT}`;
  }
  async deliver(id: string): Promise<'DELIVERED' | 'DUPLICATE' | 'SUPPRESSED'> {
    if (!medicineIdSchema.safeParse(id).success) return 'SUPPRESSED';
    return this.db.$transaction(async (tx) => {
      const occurrence = await tx.medicationOccurrence.findUnique({
        where: { id },
        include: { schedule: { include: { medication: true } } },
      });
      if (!occurrence) return 'SUPPRESSED';
      // Same user -> treatment lock order as preference/read mutations. These
      // locks serialize delivery against opt-out, role/status changes and events.
      const users = await tx.$queryRaw<
        { status: string; role: string }[]
      >`SELECT status,role FROM users WHERE id=${occurrence.patientId}::uuid FOR SHARE`;
      if (users[0]?.status !== 'ACTIVE' || users[0].role !== 'PATIENT')
        return 'SUPPRESSED';
      const preferences = await tx.notificationPreferences.findUnique({
        where: { userId: occurrence.patientId },
        select: { doseReminders: true },
      });
      if (!preferences?.doseReminders) return 'SUPPRESSED';
      const treatmentId = occurrence.schedule.medication.treatmentId;
      const treatments = await tx.$queryRaw<
        { status: string }[]
      >`SELECT status FROM treatments WHERE id=${treatmentId}::uuid AND patient_id=${occurrence.patientId}::uuid FOR UPDATE`;
      if (treatments[0]?.status !== 'ACTIVE' || !occurrence.schedule.enabled)
        return 'SUPPRESSED';
      const now = Date.now();
      if (
        occurrence.scheduledAt.getTime() > now ||
        now - occurrence.scheduledAt.getTime() > REMINDER_WINDOW_MS
      )
        return 'SUPPRESSED';
      if (
        await tx.medicationEvent.findUnique({
          where: { occurrenceId: id },
          select: { id: true },
        })
      )
        return 'SUPPRESSED';
      const profile = await tx.patientProfile.findUnique({
        where: { userId: occurrence.patientId },
        select: { preferredLanguage: true },
      });
      if (!profile) return 'SUPPRESSED';
      const text = reminderText[profile.preferredLanguage];
      const data = JSON.stringify({ treatmentId, occurrenceId: id });
      const inserted = await tx.$queryRaw<
        { id: string }[]
      >`INSERT INTO notifications (user_id,occurrence_id,type,title,body,data) VALUES (${occurrence.patientId}::uuid,${id}::uuid,'DOSE_DUE',${text.title},${text.body},${data}::jsonb) ON CONFLICT (occurrence_id) DO NOTHING RETURNING id`;
      if (!inserted[0]) return 'DUPLICATE';
      await tx.auditLog.createMany({
        data: [
          {
            actorId: null,
            resourceType: 'NOTIFICATION',
            resourceId: inserted[0].id,
            action: 'REMINDER_DELIVERED_TO_INBOX',
            metadata: { result: 'SUCCESS' },
          },
        ],
      });
      return 'DELIVERED';
    });
  }
}
