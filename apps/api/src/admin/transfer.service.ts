import { Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeCatalogText } from '@saydaliyati/validation';
import type { Prisma } from '@saydaliyati/database';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { API_CONFIG, type ApiConfig } from '../config.js';
import { ApiError } from '../auth/errors.js';
import { requireAdmin } from './admin.service.js';
import {
  columns,
  parseTransfer,
  serialize,
  type Dataset,
  type Format,
  type TransferRow,
  type Issue,
} from './transfer-format.js';
import {
  directorySchema,
  medicineSchema,
  settingsSchema,
} from './admin.schemas.js';
const userSelect = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  updatedAt: true,
} as const;
const medicineSelect = {
  id: true,
  name: true,
  genericName: true,
  strength: true,
  dosageForm: true,
  status: true,
  source: true,
  updatedAt: true,
} as const;
const directorySelect = {
  id: true,
  name: true,
  specialty: true,
  licenseNumber: true,
  address: true,
  city: true,
  phone: true,
  email: true,
  status: true,
  updatedAt: true,
} as const;
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = (value: unknown): TransferRow[] =>
  JSON.parse(JSON.stringify(value)) as TransferRow[];
type Input = { format: Format; content: string; token?: string | undefined };
type Snapshot = {
  data: TransferRow[];
  map: Map<string, TransferRow>;
  hash: string;
};
@Injectable()
export class AdminTransferService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  private async authorize(tx: Prisma.TransactionClient, actor: AuthContext) {
    await this.auth.authorizeOwnerMutation(tx, actor);
    const user = await tx.user.findUnique({
      where: { id: actor.userId },
      select: { role: true },
    });
    if (user?.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
  }
  private sign(value: string) {
    return createHmac('sha256', this.config.AUTH_SECRET)
      .update('admin-transfer-v1:' + value)
      .digest('hex');
  }
  private token(
    actor: AuthContext,
    dataset: Dataset,
    input: Input,
    snapshot: string,
  ) {
    const payload = Buffer.from(
      JSON.stringify({
        actor: actor.userId,
        dataset,
        hash: digest([input.format, input.content]),
        snapshot,
        expires: Date.now() + 15 * 60000,
      }),
    ).toString('base64url');
    return payload + '.' + this.sign(payload);
  }
  private verify(
    actor: AuthContext,
    dataset: Dataset,
    input: Input,
  ): { snapshot: string; expires: number } {
    const parts = input.token?.split('.') ?? [];
    if (parts.length !== 2) throw new ApiError('ADMIN_TRANSFER_CONFLICT');
    const [payload, signature] = parts;
    if (
      !payload ||
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(payload)))
    )
      throw new ApiError('ADMIN_TRANSFER_CONFLICT');
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      actor: string;
      dataset: string;
      hash: string;
      snapshot: string;
      expires: number;
    };
    if (
      parsed.actor !== actor.userId ||
      parsed.dataset !== dataset ||
      parsed.hash !== digest([input.format, input.content])
    )
      throw new ApiError('ADMIN_TRANSFER_CONFLICT');
    return parsed;
  }
  private async current(
    tx: Prisma.TransactionClient,
    dataset: Dataset,
    rows: TransferRow[],
  ): Promise<Snapshot> {
    const ids = rows.flatMap((row) => (row.id ? [row.id] : []));
    let data: TransferRow[];
    if (dataset === 'users')
      data = plain(
        await tx.user.findMany({
          where: { id: { in: ids } },
          select: userSelect,
          orderBy: { id: 'asc' },
        }),
      );
    else if (dataset === 'medicines')
      data = plain(
        await tx.medicine.findMany({
          where: { id: { in: ids } },
          select: medicineSelect,
          orderBy: { id: 'asc' },
        }),
      );
    else if (dataset === 'settings')
      data = plain(
        await tx.adminSettings.findMany({ where: { id: 'platform' } }),
      );
    else
      data = plain(
        await tx.adminDirectoryEntry.findMany({
          where: { id: { in: ids }, kind: dataset },
          select: directorySelect,
          orderBy: { id: 'asc' },
        }),
      );
    return {
      data,
      map: new Map(data.map((row) => [row.id!, row])),
      hash: digest(data),
    };
  }
  private plan(dataset: Dataset, rows: TransferRow[], current: Snapshot) {
    const issues: Issue[] = [];
    let creates = 0,
      updates = 0,
      unchanged = 0;
    const operations: ('create' | 'update' | 'unchanged')[] = [];
    rows.forEach((row, index) => {
      const existing =
        dataset === 'settings'
          ? current.data[0]
          : row.id
            ? current.map.get(row.id)
            : undefined;
      if (row.id && !existing)
        issues.push({
          row: index + 1,
          field: 'id',
          message: 'ID does not exist in this dataset.',
        });
      if (dataset === 'users' && existing) {
        if (
          row.status !== existing.status &&
          (existing.role === 'ADMIN' || row.status === 'PENDING_VERIFICATION')
        )
          issues.push({
            row: index + 1,
            field: 'status',
            message:
              'Admin accounts are protected; pending verification cannot be assigned by import.',
          });
        for (const key of columns.users.filter(
          (key) => !['id', 'status'].includes(key),
        )) {
          if (key in row && row[key] !== existing[key])
            issues.push({
              row: index + 1,
              field: key,
              message:
                'This account field is read-only. Only status can be imported.',
            });
        }
      }
      const changed =
        existing &&
        (dataset === 'users'
          ? row.status !== existing.status
          : columns[dataset]
              .filter((key) => key !== 'id')
              .some((key) => (row[key] ?? null) !== (existing[key] ?? null)));
      const operation = !existing ? 'create' : changed ? 'update' : 'unchanged';
      operations.push(operation);
      if (operation === 'create') creates++;
      else if (operation === 'update') updates++;
      else unchanged++;
    });
    return {
      issues: issues.slice(0, 100),
      creates,
      updates,
      unchanged,
      operations,
    };
  }
  async preview(actor: AuthContext, dataset: Dataset, input: Input) {
    requireAdmin(actor);
    const parsed = parseTransfer(dataset, input.format, input.content);
    if (parsed.issues.length)
      return {
        data: { valid: false, issues: parsed.issues, rows: [], total: 0 },
        meta: {},
      };
    const current = await this.db.client.$transaction(
      (tx) => this.current(tx, dataset, parsed.rows),
      { isolationLevel: 'RepeatableRead' },
    );
    const plan = this.plan(dataset, parsed.rows, current);
    return {
      data: {
        valid: !plan.issues.length,
        issues: plan.issues,
        total: parsed.rows.length,
        creates: plan.creates,
        updates: plan.updates,
        unchanged: plan.unchanged,
        rows: parsed.rows.slice(0, 10).map((row, i) => ({
          row: i + 1,
          operation: plan.operations[i],
          label: row.name ?? row.email ?? row.id ?? 'Platform settings',
        })),
        token: plan.issues.length
          ? null
          : this.token(actor, dataset, input, current.hash),
      },
      meta: {},
    };
  }
  async apply(
    actor: AuthContext,
    dataset: Dataset,
    input: Input,
    requestId: string,
  ) {
    requireAdmin(actor);
    const signed = this.verify(actor, dataset, input);
    const parsed = parseTransfer(dataset, input.format, input.content);
    if (parsed.issues.length) throw new ApiError('VALIDATION_ERROR');
    const receiptId = digest(input.token);
    try {
      return await this.db.client.$transaction(
        async (tx) => {
          await this.authorize(tx, actor);
          const receipt = await tx.adminTransferReceipt.findUnique({
            where: { id: receiptId },
          });
          if (receipt)
            return {
              data: { applied: receipt.count, alreadyApplied: true },
              meta: {},
            };
          if (signed.expires < Date.now())
            throw new ApiError('ADMIN_TRANSFER_CONFLICT');
          const current = await this.current(tx, dataset, parsed.rows);
          if (current.hash !== signed.snapshot)
            throw new ApiError('ADMIN_TRANSFER_CONFLICT');
          const plan = this.plan(dataset, parsed.rows, current);
          if (plan.issues.length) throw new ApiError('ADMIN_TRANSFER_CONFLICT');
          for (const [index, row] of parsed.rows.entries()) {
            if (plan.operations[index] === 'unchanged') continue;
            const id = await this.save(tx, dataset, row);
            await tx.auditLog.createMany({
              data: [
                {
                  actorId: actor.userId,
                  action: 'ADMIN_IMPORT_ROW',
                  resourceType: dataset,
                  resourceId: id,
                  metadata: {
                    requestId,
                    receiptId,
                    row: index + 1,
                    operation: plan.operations[index]!,
                    result: 'SUCCESS',
                  },
                },
              ],
            });
          }
          const count = plan.creates + plan.updates;
          await tx.adminTransferReceipt.create({
            data: { id: receiptId, actorId: actor.userId, dataset, count },
          });
          await tx.auditLog.createMany({
            data: [
              {
                actorId: actor.userId,
                action: 'ADMIN_IMPORT_COMPLETED',
                resourceType: dataset,
                metadata: { requestId, receiptId, count, result: 'SUCCESS' },
              },
            ],
          });
          return { data: { applied: count, alreadyApplied: false }, meta: {} };
        },
        { isolationLevel: 'Serializable', timeout: 30000 },
      );
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['P2034', 'P2002'].includes(String(error.code))
      ) {
        // A concurrent confirmation may have committed while this transaction rolled back.
        const receipt = await this.db.client.adminTransferReceipt.findUnique({
          where: { id: receiptId },
        });
        if (receipt)
          return {
            data: { applied: receipt.count, alreadyApplied: true },
            meta: {},
          };
        throw new ApiError('ADMIN_TRANSFER_CONFLICT');
      }
      throw error;
    }
  }
  private async save(
    tx: Prisma.TransactionClient,
    dataset: Dataset,
    row: TransferRow,
  ): Promise<string | null> {
    const { id, ...fields } = row;
    if (dataset === 'users') {
      const status = row.status as 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
      const result = await tx.user.updateMany({
        where: { id: id!, role: { not: 'ADMIN' } },
        data: { status },
      });
      if (!result.count) throw new ApiError('ADMIN_TRANSFER_CONFLICT');
      if (status !== 'ACTIVE')
        await tx.session.updateMany({
          where: { userId: id!, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      return id!;
    }
    if (dataset === 'settings') {
      const data = settingsSchema.parse(fields);
      await tx.adminSettings.upsert({
        where: { id: 'platform' },
        create: { id: 'platform', ...data },
        update: data,
      });
      return null;
    }
    if (dataset === 'medicines') {
      const data = medicineSchema
        .extend({ source: medicineSchema.shape.source.nullable() })
        .parse(fields);
      const normalizedName = normalizeCatalogText(data.name);
      if (id) {
        await tx.medicine.update({
          where: { id },
          data: { ...data, normalizedName },
          select: { id: true },
        });
        return id;
      }
      const created = await tx.$queryRaw<
        { id: string }[]
      >`INSERT INTO medicines (name, normalized_name, generic_name, strength, dosage_form, status, source) VALUES (${data.name}, ${normalizedName}, ${data.genericName}, ${data.strength}, ${data.dosageForm}, ${data.status}::medicine_status, ${data.source}) RETURNING id`;
      return created[0]!.id;
    }
    const data = directorySchema
      .omit({ countryId: true, wilayaId: true, communeId: true })
      .parse(fields);
    if (id) {
      await tx.adminDirectoryEntry.update({
        where: { id },
        data,
        select: { id: true },
      });
      return id;
    }
    return (
      await tx.adminDirectoryEntry.create({
        data: { ...data, kind: dataset },
        select: { id: true },
      })
    ).id;
  }
  async export(
    actor: AuthContext,
    dataset: Dataset,
    format: Format,
    q: string,
    template: boolean,
    requestId: string,
  ) {
    requireAdmin(actor);
    if (template) {
      const row: TransferRow =
        dataset === 'users'
          ? { id: '', status: 'ACTIVE' }
          : Object.fromEntries(
              columns[dataset]
                .filter((key) => key !== 'id')
                .map((key) => [
                  key,
                  ['name', 'source', 'organizationName', 'timezone'].includes(
                    key,
                  )
                    ? ''
                    : key === 'status'
                      ? dataset === 'medicines'
                        ? 'INACTIVE'
                        : 'DRAFT'
                      : key === 'defaultLanguage'
                        ? 'EN'
                        : null,
                ]),
            );
      return {
        data: {
          filename: `saydaliyati-${dataset}-template.${format}`,
          content: serialize(dataset, format, format === 'json' ? [row] : []),
          count: 0,
        },
        meta: {},
      };
    }
    return this.db.client.$transaction(
      async (tx) => {
        await this.authorize(tx, actor);
        let records: TransferRow[];
        const take = 50001;
        if (dataset === 'users')
          records = plain(
            await tx.user.findMany({
              where: q
                ? {
                    OR: [
                      { email: { contains: q, mode: 'insensitive' } },
                      { phone: { contains: q } },
                    ],
                  }
                : {},
              select: userSelect,
              orderBy: { id: 'asc' },
              take,
            }),
          );
        else if (dataset === 'medicines')
          records = plain(
            await tx.medicine.findMany({
              where: q
                ? {
                    OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { genericName: { contains: q, mode: 'insensitive' } },
                    ],
                  }
                : {},
              select: medicineSelect,
              orderBy: { id: 'asc' },
              take,
            }),
          );
        else if (dataset === 'settings')
          records = plain(
            await tx.adminSettings.findMany({ where: { id: 'platform' } }),
          );
        else
          records = plain(
            await tx.adminDirectoryEntry.findMany({
              where: {
                kind: dataset,
                ...(q
                  ? {
                      OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { city: { contains: q, mode: 'insensitive' } },
                      ],
                    }
                  : {}),
              },
              select: directorySelect,
              orderBy: { id: 'asc' },
              take,
            }),
          );
        if (records.length > 50000)
          throw new ApiError('ADMIN_EXPORT_TOO_LARGE');
        const rows = records.map((row) =>
          Object.fromEntries(
            columns[dataset].map((key) => [key, row[key] ?? null]),
          ),
        );
        await tx.auditLog.createMany({
          data: [
            {
              actorId: actor.userId,
              action: 'ADMIN_DATA_EXPORTED',
              resourceType: dataset,
              metadata: {
                requestId,
                count: rows.length,
                format,
                result: 'SUCCESS',
              },
            },
          ],
        });
        return {
          data: {
            filename: `saydaliyati-${dataset}.${format}`,
            content: serialize(dataset, format, rows),
            count: rows.length,
          },
          meta: {},
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
}
