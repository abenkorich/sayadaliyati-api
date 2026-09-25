import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@saydaliyati/database';
import {
  prescriptionFieldNames,
  prescriptionFieldSchemas,
  prescriptionMedicationSchema,
} from '@saydaliyati/validation';
import type {
  PrescriptionCreateInput,
  PrescriptionMedicationInput,
  PrescriptionFieldName,
  PrescriptionQuery,
  PrescriptionReviewInput,
} from '@saydaliyati/validation';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';

const header = {
  id: true,
  prescriptionDate: true,
  validUntil: true,
  source: true,
  status: true,
  processingStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;
const detailSelection = {
  ...header,
  medications: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      medicineId: true,
      extractedName: true,
      dosage: true,
      dosageUnit: true,
      frequency: true,
      frequencyUnit: true,
      duration: true,
      durationUnit: true,
      quantity: true,
      instructions: true,
      confidence: true,
      confirmationStatus: true,
      medicine: {
        select: {
          id: true,
          name: true,
          strength: true,
          dosageForm: true,
          status: true,
        },
      },
    },
  },
  documents: {
    where: { deletedAt: null },
    orderBy: { pageNumber: 'asc' },
    select: {
      id: true,
      pageNumber: true,
      mimeType: true,
      processingStatus: true,
    },
  },
} as const satisfies Prisma.PrescriptionSelect;
type Detail = Prisma.PrescriptionGetPayload<{ select: typeof detailSelection }>;
type Field = {
  id: string;
  medicationId: string;
  fieldName: PrescriptionFieldName;
  revision: number;
  value: Prisma.JsonValue | null;
  source: 'OCR' | 'AI' | 'USER' | 'PROFESSIONAL';
  confidence: number | null;
  confirmed: boolean;
  confirmedAt: Date | null;
};
const numeric = (value: number | null) =>
  value === null ? null : String(value);
const dateOnly = (value: Date | null) =>
  value?.toISOString().slice(0, 10) ?? null;
const summary = (value: PrescriptionMedicationInput) => ({
  medicineId: value.medicineId,
  extractedName: value.extractedName,
  dosage: numeric(value.dosage),
  dosageUnit: value.dosageUnit,
  frequency: numeric(value.frequency),
  frequencyUnit: value.frequencyUnit,
  duration: numeric(value.duration),
  durationUnit: value.durationUnit,
  quantity: numeric(value.quantity),
  instructions: value.instructions,
});
@Injectable()
export class PrescriptionsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
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
          resourceType: 'PRESCRIPTION',
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
  ): Promise<Detail> {
    const row = await tx.prescription.findFirst({
      where: { id, patientId: actor.userId },
      select: detailSelection,
    });
    if (!row) throw new ApiError('RESOURCE_NOT_FOUND');
    return row;
  }
  private async latest(
    tx: Prisma.TransactionClient,
    medicationIds: string[],
  ): Promise<Field[]> {
    if (!medicationIds.length) return [];
    // Select only the current revision in PostgreSQL, not an unbounded history in memory.
    return tx.$queryRaw<Field[]>`
      SELECT DISTINCT ON (prescription_medication_id, field_name)
        id, prescription_medication_id AS "medicationId", field_name AS "fieldName", revision, value,
        source, confidence::double precision AS confidence, confirmed, confirmed_at AS "confirmedAt"
      FROM prescription_extracted_fields WHERE prescription_medication_id = ANY(${medicationIds}::uuid[])
      ORDER BY prescription_medication_id, field_name, revision DESC
    `;
  }
  private async envelope(tx: Prisma.TransactionClient, row: Detail) {
    const fields = await this.latest(
      tx,
      row.medications.map((medication) => medication.id),
    );
    return {
      data: {
        ...row,
        prescriptionDate: dateOnly(row.prescriptionDate),
        validUntil: dateOnly(row.validUntil),
        medications: row.medications.map((medication) => ({
          ...medication,
          dosage: medication.dosage?.toString() ?? null,
          frequency: medication.frequency?.toString() ?? null,
          duration: medication.duration?.toString() ?? null,
          quantity: medication.quantity?.toString() ?? null,
          confidence: medication.confidence?.toNumber() ?? null,
          fields: fields
            .filter((field) => field.medicationId === medication.id)
            .map((field) => ({
              id: field.id,
              fieldName: field.fieldName,
              revision: field.revision,
              value: field.value,
              source: field.source,
              confidence: field.confidence,
              confirmed: field.confirmed,
              confirmedAt: field.confirmedAt,
            })),
        })),
      },
      meta: {},
    };
  }
  async list(actor: AuthContext, query: PrescriptionQuery) {
    this.patient(actor);
    const where: Prisma.PrescriptionWhereInput = {
      patientId: actor.userId,
      status: query.status ?? { not: 'ARCHIVED' },
    };
    const [rows, total] = await this.db.client.$transaction(
      [
        this.db.client.prescription.findMany({
          where,
          select: { ...header, _count: { select: { medications: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.client.prescription.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data: rows.map(({ _count, ...row }) => ({
        ...row,
        prescriptionDate: dateOnly(row.prescriptionDate),
        validUntil: dateOnly(row.validUntil),
        medicationCount: _count.medications,
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
    return this.db.client.$transaction(
      async (tx) => this.envelope(tx, await this.load(tx, actor, id)),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private async medicineReferences(
    tx: Prisma.TransactionClient,
    values: PrescriptionMedicationInput[],
  ) {
    const ids = [
      ...new Set(
        values.flatMap((value) => (value.medicineId ? [value.medicineId] : [])),
      ),
    ];
    const count = await tx.medicine.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new ApiError('RESOURCE_NOT_FOUND');
  }
  async create(
    actor: AuthContext,
    input: PrescriptionCreateInput,
    requestId: string,
  ) {
    this.patient(actor);
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizePatientMutation(tx, actor);
      await this.medicineReferences(tx, input.medications);
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO prescriptions (patient_id, prescription_date, valid_until, source)
        VALUES (${actor.userId}::uuid, ${input.prescriptionDate}::date, ${input.validUntil}::date, 'MANUAL') RETURNING id`;
      const id = rows[0]?.id;
      if (!id) throw new Error('Prescription insert returned no ID');
      for (const value of input.medications) {
        const lines = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO prescription_medications (prescription_id, medicine_id, extracted_name, dosage, dosage_unit,
            frequency, frequency_unit, duration, duration_unit, quantity, instructions)
          VALUES (${id}::uuid, ${value.medicineId}::uuid, ${value.extractedName}, ${numeric(value.dosage)}::numeric,
            ${value.dosageUnit}, ${numeric(value.frequency)}::numeric, ${value.frequencyUnit}, ${numeric(value.duration)}::numeric,
            ${value.durationUnit}, ${numeric(value.quantity)}::numeric, ${value.instructions}) RETURNING id`;
        const medicationId = lines[0]?.id;
        if (!medicationId) throw new Error('Medication insert returned no ID');
        await tx.prescriptionExtractedField.createMany({
          data: prescriptionFieldNames.map((fieldName) => ({
            prescriptionMedicationId: medicationId,
            fieldName,
            revision: 1,
            value: value[fieldName] ?? Prisma.DbNull,
            source: 'USER',
            confirmed: false,
          })),
        });
      }
      await this.audit(tx, actor, id, 'PRESCRIPTION_CREATED', requestId);
      return this.envelope(tx, await this.load(tx, actor, id));
    });
  }
  private async lock(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
  ) {
    await this.auth.authorizePatientMutation(tx, actor);
    await tx.$queryRaw`SELECT id FROM prescriptions WHERE id = ${id}::uuid AND patient_id = ${actor.userId}::uuid FOR UPDATE`;
    return this.load(tx, actor, id);
  }
  async treatmentSource(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
  ) {
    await tx.$queryRaw`SELECT id FROM prescriptions WHERE id = ${id}::uuid AND patient_id = ${actor.userId}::uuid FOR UPDATE`;
    const row = await this.load(tx, actor, id);
    if (row.status !== 'CONFIRMED' || row.source !== 'MANUAL')
      throw new ApiError('PRESCRIPTION_CONFIRMATION_REQUIRED');
    const fields = await this.latest(
      tx,
      row.medications.map((m) => m.id),
    );
    return row.medications
      .filter((m) => m.confirmationStatus !== 'REJECTED')
      .map((m) => ({
        ...Object.fromEntries(
          fields
            .filter((f) => f.medicationId === m.id)
            .map((f) => [f.fieldName, f.value]),
        ),
      }));
  }
  private async confirm(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    row: Detail,
    ids: string[],
    requestId: string,
  ) {
    if (
      !['DRAFT', 'CONFIRMED'].includes(row.status) ||
      row.source !== 'MANUAL' ||
      row.processingStatus !== null
    )
      throw new ApiError('PRESCRIPTION_REVIEW_CONFLICT');
    const retained = row.medications.filter(
      (m) => m.confirmationStatus !== 'REJECTED',
    );
    if (
      !retained.length ||
      retained.length > 20 ||
      new Set(retained.map((m) => m.medicineId)).size !== retained.length
    )
      throw new ApiError('PRESCRIPTION_CONFIRMATION_REQUIRED');
    const fields = await this.latest(
      tx,
      retained.map((m) => m.id),
    );
    if (fields.length !== ids.length || fields.some((f) => !ids.includes(f.id)))
      throw new ApiError('PRESCRIPTION_REVIEW_CONFLICT');
    for (const line of retained) {
      const current = fields.filter((f) => f.medicationId === line.id);
      const values = prescriptionMedicationSchema.parse(
        Object.fromEntries(current.map((f) => [f.fieldName, f.value])),
      );
      if (
        current.length !== prescriptionFieldNames.length ||
        current.some((f) => !f.confirmed) ||
        !values.medicineId ||
        !values.dosage ||
        !values.dosageUnit ||
        !values.scheduledTimes ||
        values.scheduledTimes.length > 12 ||
        !values.startDate ||
        !values.endDate ||
        (values.frequency !== null &&
          (values.frequencyUnit !== 'DAY' ||
            values.frequency !== values.scheduledTimes.length)) ||
        (values.duration !== null &&
          (values.durationUnit !== 'DAY' ||
            values.duration !==
              (Date.parse(values.endDate) - Date.parse(values.startDate)) /
                86400000 +
                1))
      )
        throw new ApiError('PRESCRIPTION_CONFIRMATION_REQUIRED');
    }
    if (row.status !== 'CONFIRMED') {
      await tx.prescriptionMedication.updateMany({
        where: { id: { in: retained.map((m) => m.id) } },
        data: { confirmationStatus: 'CONFIRMED' },
      });
      await tx.prescription.update({
        where: { id: row.id },
        data: { status: 'CONFIRMED' },
      });
      await this.audit(tx, actor, row.id, 'PRESCRIPTION_CONFIRMED', requestId);
    }
    return this.envelope(tx, await this.load(tx, actor, row.id));
  }
  async review(
    actor: AuthContext,
    id: string,
    input: PrescriptionReviewInput,
    requestId: string,
  ) {
    this.patient(actor);
    return this.db.client.$transaction(async (tx) => {
      const row = await this.lock(tx, actor, id);
      if (input.status === 'CONFIRMED')
        return this.confirm(
          tx,
          actor,
          row,
          input.confirmationFieldIds!,
          requestId,
        );
      if (input.status === 'ARCHIVED') {
        await this.archiveRow(tx, actor, row, requestId);
        return this.envelope(tx, await this.load(tx, actor, id));
      }
      if (
        row.status !== 'DRAFT' ||
        row.source !== 'MANUAL' ||
        row.processingStatus !== null
      )
        throw new ApiError('PRESCRIPTION_REVIEW_CONFLICT');
      const fields = await this.latest(
        tx,
        row.medications.map((medication) => medication.id),
      );
      const byId = new Map(fields.map((field) => [field.id, field]));
      const lines = new Map(row.medications.map((line) => [line.id, line]));
      const rejected = new Set(input.rejectedMedicationIds ?? []);
      for (const medicationId of rejected)
        if (!lines.has(medicationId)) throw new ApiError('RESOURCE_NOT_FOUND');
      const changes = new Map<string, Record<string, unknown>>();
      const revisions: Prisma.PrescriptionExtractedFieldCreateManyInput[] = [];
      for (const review of input.fieldReviews ?? []) {
        const field = byId.get(review.fieldId);
        if (!field) throw new ApiError('PRESCRIPTION_REVIEW_CONFLICT');
        if (
          lines.get(field.medicationId)?.confirmationStatus === 'REJECTED' ||
          rejected.has(field.medicationId)
        )
          throw new ApiError('PRESCRIPTION_REVIEW_CONFLICT');
        const parsed = prescriptionFieldSchemas[field.fieldName].safeParse(
          review.value,
        );
        if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
        const values =
          changes.get(field.medicationId) ??
          Object.fromEntries(
            fields
              .filter(
                (candidate) => candidate.medicationId === field.medicationId,
              )
              .map((candidate) => [candidate.fieldName, candidate.value]),
          );
        values[field.fieldName] = parsed.data;
        changes.set(field.medicationId, values);
        const changed =
          JSON.stringify(parsed.data) !== JSON.stringify(field.value);
        revisions.push({
          prescriptionMedicationId: field.medicationId,
          fieldName: field.fieldName,
          revision: field.revision + 1,
          value: parsed.data ?? Prisma.DbNull,
          source: changed ? 'USER' : field.source,
          confidence: changed ? null : field.confidence,
          confirmed: review.confirmed,
          confirmedBy: review.confirmed ? actor.userId : null,
          confirmedAt: review.confirmed ? new Date() : null,
        });
      }
      const summaries = [...changes.entries()].map(([medicationId, value]) => {
        const result = prescriptionMedicationSchema.safeParse(value);
        if (!result.success) throw new ApiError('VALIDATION_ERROR');
        return { medicationId, value: result.data };
      });
      await this.medicineReferences(
        tx,
        summaries.map((entry) => entry.value),
      );
      if (revisions.length)
        await tx.prescriptionExtractedField.createMany({ data: revisions });
      for (const entry of summaries)
        await tx.prescriptionMedication.update({
          where: { id: entry.medicationId, prescriptionId: id },
          data: summary(entry.value),
        });
      if (rejected.size)
        await tx.prescriptionMedication.updateMany({
          where: { prescriptionId: id, id: { in: [...rejected] } },
          data: { confirmationStatus: 'REJECTED' },
        });
      await tx.prescription.update({
        where: { id, patientId: actor.userId },
        data: { updatedAt: new Date() },
      });
      await this.audit(
        tx,
        actor,
        id,
        'PRESCRIPTION_FIELDS_REVIEWED',
        requestId,
      );
      return this.envelope(tx, await this.load(tx, actor, id));
    });
  }
  private async archiveRow(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    row: Detail,
    requestId: string,
  ) {
    if (row.status === 'ARCHIVED') return;
    await tx.prescription.update({
      where: { id: row.id, patientId: actor.userId },
      data: { status: 'ARCHIVED' },
    });
    await this.audit(tx, actor, row.id, 'PRESCRIPTION_ARCHIVED', requestId);
  }
  async archive(actor: AuthContext, id: string, requestId: string) {
    this.patient(actor);
    await this.db.client.$transaction(async (tx) =>
      this.archiveRow(tx, actor, await this.lock(tx, actor, id), requestId),
    );
    return { data: {}, meta: {} };
  }
}
