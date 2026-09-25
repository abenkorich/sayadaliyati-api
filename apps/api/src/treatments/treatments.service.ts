import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import type {
  TreatmentCreateInput,
  TreatmentQuery,
  MedicationEventInput,
  MedicationEventQuery,
} from '@saydaliyati/validation';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { PrescriptionsService } from '../prescriptions/prescriptions.service.js';
import { localToday, scheduleDates, validateSchedules } from './scheduling.js';
const date = (v: Date) => v.toISOString().slice(0, 10);
const header = {
  id: true,
  prescriptionId: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
const include = {
  ...header,
  medications: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      medicineId: true,
      dose: true,
      doseUnit: true,
      scheduleType: true,
      instructions: true,
      schedules: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          time: true,
          timezone: true,
          daysOfWeek: true,
          startDate: true,
          endDate: true,
          enabled: true,
          occurrences: {
            orderBy: { scheduledAt: 'asc' },
            select: {
              id: true,
              localDate: true,
              timezone: true,
              scheduledAt: true,
              event: {
                select: {
                  id: true,
                  status: true,
                  notes: true,
                  recordedAt: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.TreatmentSelect;
const eventSelection = {
  id: true,
  occurrenceId: true,
  scheduledAt: true,
  recordedAt: true,
  status: true,
  notes: true,
} as const;
@Injectable()
export class TreatmentsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrescriptionsService)
    private readonly prescriptions: PrescriptionsService,
  ) {}
  private patient(actor: AuthContext) {
    if (actor.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
    action: string,
    requestId: string,
  ) {
    await tx.auditLog.createMany({
      data: [
        {
          actorId: actor.userId,
          resourceType: 'TREATMENT',
          resourceId: id,
          action,
          metadata: { requestId, result: 'SUCCESS' },
        },
      ],
    });
  }
  private async load(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
  ) {
    const row = await tx.treatment.findFirst({
      where: { id, patientId: actor.userId },
      select: include,
    });
    if (!row) throw new ApiError('RESOURCE_NOT_FOUND');
    return row;
  }
  private async envelope(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
  ) {
    const row = await this.load(tx, actor, id),
      now = Date.now();
    const dueCutoff = ['COMPLETED', 'CANCELLED'].includes(row.status)
      ? Math.min(now, row.updatedAt.getTime())
      : now;
    const all = row.medications.flatMap((m) =>
      m.schedules.flatMap((s) => s.occurrences),
    );
    return {
      data: {
        ...row,
        startDate: date(row.startDate),
        endDate: date(row.endDate),
        medications: row.medications.map((m) => ({
          ...m,
          dose: m.dose.toString(),
          schedules: m.schedules.map((s) => ({
            ...s,
            time: s.time.toISOString().slice(11, 16),
            startDate: date(s.startDate),
            endDate: date(s.endDate),
            occurrences: s.occurrences.map((o) => ({
              occurrenceId: o.id,
              timezone: o.timezone,
              scheduledAt: o.scheduledAt,
              event: o.event,
              localDate: date(o.localDate),
              eligible:
                row.status === 'ACTIVE' &&
                o.scheduledAt.getTime() <= now &&
                !o.event,
            })),
          })),
        })),
        progress: {
          scheduled: all.length,
          due: all.filter((o) => o.scheduledAt.getTime() <= dueCutoff).length,
          taken: all.filter((o) => o.event?.status === 'TAKEN').length,
          skipped: all.filter((o) => o.event?.status === 'SKIPPED').length,
          unrecordedDue: all.filter(
            (o) => o.scheduledAt.getTime() <= dueCutoff && !o.event,
          ).length,
        },
      },
      meta: {},
    };
  }
  async list(actor: AuthContext, query: TreatmentQuery) {
    this.patient(actor);
    const where: Prisma.TreatmentWhereInput = {
      patientId: actor.userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.db.client.$transaction(
      [
        this.db.client.treatment.findMany({
          where,
          select: header,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.client.treatment.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data: rows.map((r) => ({
        ...r,
        startDate: date(r.startDate),
        endDate: date(r.endDate),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async detail(actor: AuthContext, id: string) {
    this.patient(actor);
    return this.db.client.$transaction((tx) => this.envelope(tx, actor, id), {
      isolationLevel: 'RepeatableRead',
    });
  }
  async create(
    actor: AuthContext,
    input: TreatmentCreateInput,
    requestId: string,
  ) {
    this.patient(actor);
    return this.db.client.$transaction(
      async (tx) => {
        await this.auth.authorizePatientMutation(tx, actor);
        const profile = await tx.patientProfile.findUnique({
          where: { userId: actor.userId },
          select: { timezone: true },
        });
        if (!profile) throw new ApiError('SERVICE_UNAVAILABLE');
        if (input.startDate < localToday(profile.timezone))
          throw new ApiError('VALIDATION_ERROR');
        validateSchedules(input, profile.timezone);
        if (
          (await tx.medicine.count({
            where: {
              id: { in: input.medications.map((m) => m.medicineId) },
              status: 'ACTIVE',
            },
          })) !== input.medications.length
        )
          throw new ApiError('RESOURCE_NOT_FOUND');
        if (input.prescriptionId) {
          const source = await this.prescriptions.treatmentSource(
            tx,
            actor,
            input.prescriptionId,
          );
          if (source.length !== input.medications.length)
            throw new ApiError('PRESCRIPTION_CONFIRMATION_REQUIRED');
          for (const m of input.medications) {
            const line = source.find((v) => v['medicineId'] === m.medicineId);
            const times = line?.['scheduledTimes'];
            if (
              !line ||
              line['dosage'] !== m.dose ||
              line['dosageUnit'] !== m.doseUnit ||
              line['instructions'] !== m.instructions ||
              !Array.isArray(times) ||
              times.length !== m.schedules.length ||
              m.schedules.some(
                (s) =>
                  !times.includes(s.time) ||
                  s.daysOfWeek.length !== 7 ||
                  s.startDate !== line['startDate'] ||
                  s.endDate !== line['endDate'],
              )
            )
              throw new ApiError('PRESCRIPTION_CONFIRMATION_REQUIRED');
          }
        }
        const [row] = await tx.$queryRaw<
          { id: string }[]
        >`INSERT INTO treatments (patient_id,prescription_id,name,start_date,end_date) VALUES (${actor.userId}::uuid,${input.prescriptionId}::uuid,${input.name},${input.startDate}::date,${input.endDate}::date) RETURNING id`;
        if (!row) throw new Error('Treatment insert failed');
        for (const m of input.medications) {
          const [med] = await tx.$queryRaw<
            { id: string }[]
          >`INSERT INTO treatment_medications (treatment_id,medicine_id,dose,dose_unit,schedule_type,instructions) VALUES (${row.id}::uuid,${m.medicineId}::uuid,${String(m.dose)}::numeric,${m.doseUnit},'FIXED_TIMES',${m.instructions}) RETURNING id`;
          if (!med) throw new Error('Medication insert failed');
          for (const s of m.schedules)
            await tx.$executeRaw`INSERT INTO medication_schedules (treatment_medication_id,time,timezone,days_of_week,start_date,end_date) VALUES (${med.id}::uuid,${s.time}::time,${profile.timezone},${s.daysOfWeek}::smallint[],${s.startDate}::date,${s.endDate}::date)`;
        }
        await this.audit(tx, actor, row.id, 'TREATMENT_CREATED', requestId);
        return this.envelope(tx, actor, row.id);
      },
      { timeout: 15000 },
    );
  }
  async state(
    actor: AuthContext,
    id: string,
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
    requestId: string,
  ) {
    this.patient(actor);
    return this.db.client.$transaction(
      async (tx) => {
        await this.auth.authorizePatientMutation(tx, actor);
        await tx.$queryRaw`SELECT id FROM treatments WHERE id=${id}::uuid AND patient_id=${actor.userId}::uuid FOR UPDATE`;
        const row = await this.load(tx, actor, id);
        if (row.status === status) return this.envelope(tx, actor, id);
        if (!(
          (row.status === 'PLANNED' &&
            ['ACTIVE', 'CANCELLED'].includes(status)) ||
          (row.status === 'ACTIVE' &&
            ['COMPLETED', 'CANCELLED'].includes(status))
        ))
          throw new ApiError('TREATMENT_CONFLICT');
        const now = new Date();
        if (status === 'ACTIVE') {
          if (
            (await tx.medicine.count({
              where: {
                id: { in: row.medications.map((m) => m.medicineId) },
                status: 'ACTIVE',
              },
            })) !== row.medications.length
          )
            throw new ApiError('RESOURCE_NOT_FOUND');
          if (row.prescriptionId)
            await this.prescriptions.treatmentSource(
              tx,
              actor,
              row.prescriptionId,
            );
          const pending: Prisma.MedicationOccurrenceCreateManyInput[] = [];
          for (const m of row.medications)
            for (const s of m.schedules) {
              for (const occurrence of scheduleDates(
                {
                  time: s.time.toISOString().slice(11, 16),
                  daysOfWeek: s.daysOfWeek,
                  startDate: date(s.startDate),
                  endDate: date(s.endDate),
                },
                s.timezone,
              )) {
                if (occurrence.scheduledAt >= now)
                  pending.push({
                    patientId: actor.userId,
                    scheduleId: s.id,
                    localDate: new Date(occurrence.localDate),
                    timezone: s.timezone,
                    scheduledAt: occurrence.scheduledAt,
                  });
              }
            }
          if (!pending.length || pending.length > 5000)
            throw new ApiError('TREATMENT_CONFLICT');
          await tx.treatment.update({
            where: { id },
            data: { status, activatedAt: now },
            select: { id: true },
          });
          await tx.medicationOccurrence.createMany({ data: pending });
        } else
          await tx.treatment.update({
            where: { id },
            data: { status },
            select: { id: true },
          });
        await this.audit(tx, actor, id, `TREATMENT_${status}`, requestId);
        return this.envelope(tx, actor, id);
      },
      { timeout: 15000 },
    );
  }
  async event(
    actor: AuthContext,
    input: MedicationEventInput,
    requestId: string,
  ) {
    this.patient(actor);
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizePatientMutation(tx, actor);
      const occurrence = await tx.medicationOccurrence.findFirst({
        where: { id: input.occurrenceId, patientId: actor.userId },
        include: { schedule: { include: { medication: true } } },
      });
      if (!occurrence) throw new ApiError('RESOURCE_NOT_FOUND');
      const treatmentId = occurrence.schedule.medication.treatmentId;
      await tx.$queryRaw`SELECT id FROM treatments WHERE id=${treatmentId}::uuid AND patient_id=${actor.userId}::uuid FOR UPDATE`;
      const existing = await tx.medicationEvent.findUnique({
        where: { occurrenceId: input.occurrenceId },
        select: eventSelection,
      });
      if (existing) {
        if (existing.status !== input.status || existing.notes !== input.notes)
          throw new ApiError('MEDICATION_EVENT_CONFLICT');
        return { data: existing, meta: {} };
      }
      const treatment = await tx.treatment.findUnique({
        where: { id: treatmentId },
        select: { status: true, patientId: true },
      });
      if (
        treatment?.patientId !== actor.userId ||
        treatment.status !== 'ACTIVE' ||
        !occurrence.schedule.enabled ||
        occurrence.scheduledAt > new Date()
      )
        throw new ApiError('TREATMENT_CONFLICT');
      const [event] = await tx.$queryRaw<
        { id: string }[]
      >`INSERT INTO medication_events (occurrence_id,patient_id,treatment_medication_id,scheduled_at,status,notes) VALUES (${input.occurrenceId}::uuid,${actor.userId}::uuid,${occurrence.schedule.treatmentMedicationId}::uuid,${occurrence.scheduledAt},${input.status}::medication_event_status,${input.notes}) RETURNING id`;
      if (!event) throw new Error('Event insert failed');
      await this.audit(
        tx,
        actor,
        event.id,
        'MEDICATION_EVENT_RECORDED',
        requestId,
      );
      return {
        data: await tx.medicationEvent.findUniqueOrThrow({
          where: { id: event.id },
          select: eventSelection,
        }),
        meta: {},
      };
    });
  }
  async events(actor: AuthContext, q: MedicationEventQuery) {
    this.patient(actor);
    const where: Prisma.MedicationEventWhereInput = {
      patientId: actor.userId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.treatmentMedicationId
        ? { treatmentMedicationId: q.treatmentMedicationId }
        : {}),
      ...(q.treatmentId ? { medication: { treatmentId: q.treatmentId } } : {}),
      ...(q.from || q.to
        ? {
            scheduledAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.db.client.$transaction(
      [
        this.db.client.medicationEvent.findMany({
          where,
          select: eventSelection,
          orderBy: [{ scheduledAt: 'desc' }, { id: 'asc' }],
          take: q.limit,
          skip: (q.page - 1) * q.limit,
        }),
        this.db.client.medicationEvent.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data,
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
}
