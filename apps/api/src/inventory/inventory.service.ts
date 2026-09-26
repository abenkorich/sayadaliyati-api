import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import type {
  InventoryCreateInput,
  InventoryPatchInput,
  InventoryQuery,
} from '@saydaliyati/validation';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';

const selection = {
  id: true,
  medicineId: true,
  quantity: true,
  unit: true,
  batchNumber: true,
  expiryDate: true,
  purchaseDate: true,
  storageLocation: true,
  source: true,
  notes: true,
  lowStockThreshold: true,
  createdAt: true,
  updatedAt: true,
  medicine: {
    select: {
      id: true,
      boxImageUrl: true,
      category: { select: { id: true, slug: true, name: true } },
      name: true,
      brandName: true,
      genericName: true,
      strength: true,
      dosageForm: true,
      status: true,
    },
  },
} as const satisfies Prisma.MedicationInventorySelect;
type InventoryRow = Prisma.MedicationInventoryGetPayload<{
  select: typeof selection;
}>;
const dateOnly = (date: Date | null) =>
  date?.toISOString().slice(0, 10) ?? null;
const asDate = (date: string | null) =>
  date === null ? null : new Date(`${date}T00:00:00.000Z`);
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');
const present = (row: InventoryRow) => ({
  id: row.id,
  medicineId: row.medicineId,
  medicine: row.medicine,
  unit: row.unit,
  batchNumber: row.batchNumber,
  storageLocation: row.storageLocation,
  source: row.source,
  notes: row.notes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  quantity: row.quantity.toString(),
  lowStockThreshold: row.lowStockThreshold?.toString() ?? null,
  expiryDate: dateOnly(row.expiryDate),
  purchaseDate: dateOnly(row.purchaseDate),
  isLowStock:
    row.lowStockThreshold !== null && row.quantity.lte(row.lowStockThreshold),
});

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private patient(actor: AuthContext): void {
    if (actor.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
  }
  private async audit(
    tx: Prisma.TransactionClient,
    action: string,
    actor: AuthContext,
    id: string,
    requestId: string,
  ) {
    await tx.auditLog.createMany({
      data: [
        {
          actorId: actor.userId,
          action,
          resourceType: 'MEDICATION_INVENTORY',
          resourceId: id,
          metadata: { requestId, result: 'SUCCESS' },
        },
      ],
    });
  }
  private async current(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
    includeArchived = false,
  ) {
    const row = await tx.medicationInventory.findFirst({
      where: {
        id,
        patientId: actor.userId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      select: { ...selection, archivedAt: true },
    });
    if (!row) throw new ApiError('RESOURCE_NOT_FOUND');
    return row;
  }
  private async lock(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
  ) {
    await tx.$queryRaw`SELECT id FROM medication_inventory WHERE id = ${id}::uuid AND patient_id = ${actor.userId}::uuid FOR UPDATE`;
  }
  async list(actor: AuthContext, query: InventoryQuery) {
    this.patient(actor);
    const clauses: Prisma.MedicationInventoryWhereInput[] = [];
    if (query.q) {
      const contains = {
        contains: literal(query.q),
        mode: 'insensitive' as const,
      };
      clauses.push({
        OR: [
          { medicine: { normalizedName: contains } },
          { medicine: { brandName: contains } },
          { medicine: { genericName: contains } },
          { batchNumber: contains },
        ],
      });
    }
    const threshold =
      this.db.client.medicationInventory.fields.lowStockThreshold;
    if (query.lowStock === true)
      clauses.push({
        lowStockThreshold: { not: null },
        quantity: { lte: threshold },
      });
    if (query.lowStock === false)
      clauses.push({
        OR: [{ lowStockThreshold: null }, { quantity: { gt: threshold } }],
      });
    const where: Prisma.MedicationInventoryWhereInput = {
      patientId: actor.userId,
      archivedAt: null,
      ...(query.medicineId ? { medicineId: query.medicineId } : {}),
      ...(query.expiryBefore
        ? {
            expiryDate: { lt: new Date(`${query.expiryBefore}T00:00:00.000Z`) },
          }
        : {}),
      AND: clauses,
    };
    const orderBy: Prisma.MedicationInventoryOrderByWithRelationInput[] =
      query.sort === 'expiry_asc'
        ? [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
        : query.sort === 'name_asc'
          ? [{ medicine: { normalizedName: 'asc' } }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [rows, total] = await this.db.client.$transaction(
      [
        this.db.client.medicationInventory.findMany({
          where,
          select: selection,
          orderBy,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.client.medicationInventory.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data: rows.map(present),
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
    const row = await this.current(this.db.client, actor, id);
    return { data: present(row), meta: {} };
  }
  async create(
    actor: AuthContext,
    input: InventoryCreateInput,
    requestId: string,
  ) {
    this.patient(actor);
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizePatientMutation(tx, actor);
      if (
        !(await tx.medicine.findUnique({
          where: { id: input.medicineId },
          select: { id: true },
        }))
      )
        throw new ApiError('RESOURCE_NOT_FOUND');
      // Explicit INSERT columns honor the restricted role and DB-generated identity/timestamps.
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO medication_inventory
          (patient_id, medicine_id, quantity, unit, batch_number, expiry_date, purchase_date,
           storage_location, source, notes, low_stock_threshold)
        VALUES (${actor.userId}::uuid, ${input.medicineId}::uuid, ${String(input.quantity)}::numeric,
          ${input.unit}::inventory_unit, ${input.batchNumber ?? null}, ${input.expiryDate ?? null}::date,
          ${input.purchaseDate ?? null}::date, ${input.storageLocation ?? null},
          ${input.source ?? null}::inventory_source, ${input.notes ?? null},
          ${input.lowStockThreshold === undefined || input.lowStockThreshold === null ? null : String(input.lowStockThreshold)}::numeric)
        RETURNING id
      `;
      const id = rows[0]?.id;
      if (!id) throw new Error('Inventory insert returned no ID');
      await this.audit(tx, 'INVENTORY_CREATED', actor, id, requestId);
      const row = await tx.medicationInventory.findUniqueOrThrow({
        where: { id },
        select: selection,
      });
      return { data: present(row), meta: {} };
    });
  }
  async patch(
    actor: AuthContext,
    id: string,
    input: InventoryPatchInput,
    requestId: string,
  ) {
    this.patient(actor);
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizePatientMutation(tx, actor);
      await this.lock(tx, actor, id);
      const current = await this.current(tx, actor, id);
      if (
        input.unit !== undefined &&
        input.unit !== current.unit &&
        (input.quantity === undefined || input.lowStockThreshold === undefined)
      ) {
        throw new ApiError('VALIDATION_ERROR');
      }
      const { expiryDate, purchaseDate } = input;
      const row = await tx.medicationInventory.update({
        where: { id, patientId: actor.userId, archivedAt: null },
        data: {
          ...(input.quantity !== undefined
            ? { quantity: String(input.quantity) }
            : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
          ...(input.batchNumber !== undefined
            ? { batchNumber: input.batchNumber }
            : {}),
          ...(input.storageLocation !== undefined
            ? { storageLocation: input.storageLocation }
            : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.lowStockThreshold !== undefined
            ? {
                lowStockThreshold:
                  input.lowStockThreshold === null
                    ? null
                    : String(input.lowStockThreshold),
              }
            : {}),
          ...(expiryDate !== undefined
            ? { expiryDate: asDate(expiryDate) }
            : {}),
          ...(purchaseDate !== undefined
            ? { purchaseDate: asDate(purchaseDate) }
            : {}),
        },
        select: selection,
      });
      await this.audit(tx, 'INVENTORY_UPDATED', actor, id, requestId);
      return { data: present(row), meta: {} };
    });
  }
  async archive(actor: AuthContext, id: string, requestId: string) {
    this.patient(actor);
    await this.db.client.$transaction(async (tx) => {
      await this.auth.authorizePatientMutation(tx, actor);
      await this.lock(tx, actor, id);
      const row = await this.current(tx, actor, id, true);
      if (!row.archivedAt) {
        await tx.medicationInventory.update({
          where: { id, patientId: actor.userId },
          data: { archivedAt: new Date() },
        });
        await this.audit(tx, 'INVENTORY_ARCHIVED', actor, id, requestId);
      }
    });
    return { data: {}, meta: {} };
  }
}
