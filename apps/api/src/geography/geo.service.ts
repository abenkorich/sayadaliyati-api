import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import type { z } from 'zod';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
function requireAdmin(actor: AuthContext) {
  if (actor.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
}
import { geoKind, geoRecord, geoImport, readGeoCsv } from './geo.schemas.js';
type Kind = z.infer<typeof geoKind>;
export async function validateDirectoryLocation(
  tx: Prisma.TransactionClient,
  input: {
    countryId?: string | null;
    wilayaId?: string | null;
    communeId?: string | null;
  },
) {
  const { countryId, wilayaId, communeId } = input;
  if ((wilayaId && !countryId) || (communeId && !wilayaId))
    throw new ApiError('VALIDATION_ERROR');
  for (const [id, kind, parentId] of [
    [countryId, 'countries', null],
    [wilayaId, 'wilayas', countryId],
    [communeId, 'communes', wilayaId],
  ] as const) {
    if (
      id &&
      !(await tx.geoZone.findFirst({
        where: { id, kind, parentId: parentId ?? null },
      }))
    )
      throw new ApiError('VALIDATION_ERROR');
  }
}
@Injectable()
export class GeoService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  async list(kind: Kind, parentId?: string) {
    if (kind !== 'countries' && !parentId) return { data: [], meta: {} };
    return {
      data: await this.db.client.geoZone.findMany({
        where: { kind, parentId: parentId ?? null },
        orderBy: [{ nameEnglish: 'asc' }, { code: 'asc' }],
        take: 5000,
      }),
      meta: {},
    };
  }
  private async authorize(tx: Prisma.TransactionClient, actor: AuthContext) {
    await this.auth.authorizeOwnerMutation(tx, actor);
    if (
      (
        await tx.user.findUnique({
          where: { id: actor.userId },
          select: { role: true },
        })
      )?.role !== 'ADMIN'
    )
      throw new ApiError('FORBIDDEN');
  }
  private async parent(
    tx: Prisma.TransactionClient,
    kind: Kind,
    parentId: string | null,
  ) {
    if (kind === 'countries') {
      if (parentId) throw new ApiError('VALIDATION_ERROR');
      return;
    }
    if (
      !parentId ||
      !(await tx.geoZone.findFirst({
        where: {
          id: parentId,
          kind: kind === 'wilayas' ? 'countries' : 'wilayas',
        },
      }))
    )
      throw new ApiError('VALIDATION_ERROR');
  }
  async save(
    actor: AuthContext,
    kind: Kind,
    id: string | undefined,
    input: z.infer<typeof geoRecord>,
    requestId: string,
  ) {
    requireAdmin(actor);
    return this.db.client.$transaction(async (tx) => {
      await this.authorize(tx, actor);
      await this.parent(tx, kind, input.parentId);
      if (kind === 'countries' && !/^[A-Z]{2}$/.test(input.code))
        throw new ApiError('VALIDATION_ERROR');
      const data = { ...input, kind, scope: input.parentId ?? 'ROOT' };
      if (id) {
        const existing = await tx.geoZone.findUnique({ where: { id } });
        if (!existing || existing.kind !== kind)
          throw new ApiError('RESOURCE_NOT_FOUND');
        if (
          existing.parentId !== input.parentId ||
          existing.code !== input.code
        )
          throw new ApiError('VALIDATION_ERROR');
      }
      const found = await tx.geoZone.findUnique({
        where: {
          kind_scope_code: { kind, scope: data.scope, code: data.code },
        },
      });
      if (!id && found) throw new ApiError('VALIDATION_ERROR');
      const result = id
        ? await tx.geoZone.update({ where: { id }, data })
        : await tx.geoZone.create({ data });
      await tx.auditLog.createMany({
        data: [
          {
            actorId: actor.userId,
            action: 'ADMIN_GEOGRAPHY_SAVED',
            resourceType: 'GEOGRAPHY',
            resourceId: result.id,
            metadata: { requestId },
          },
        ],
      });
      return { data: result, meta: {} };
    });
  }
  async import(
    actor: AuthContext,
    kind: Kind,
    input: z.infer<typeof geoImport>,
    apply: boolean,
    requestId: string,
  ) {
    requireAdmin(actor);
    let rows: ReturnType<typeof readGeoCsv>;
    try {
      rows = readGeoCsv(kind, input.content);
    } catch (e) {
      return {
        data: {
          valid: false,
          errors: [e instanceof Error ? e.message : 'Invalid CSV.'],
          count: 0,
          rows: [],
        },
        meta: {},
      };
    }
    return this.db.client.$transaction(
      async (tx) => {
        await this.authorize(tx, actor);
        if (
          kind !== 'countries' &&
          (!input.countryId ||
            !(await tx.geoZone.findFirst({
              where: { id: input.countryId, kind: 'countries' },
            })))
        )
          throw new ApiError('VALIDATION_ERROR');
        const parents =
          kind === 'communes'
            ? await tx.geoZone.findMany({
                where: { kind: 'wilayas', parentId: input.countryId! },
              })
            : [];
        const prepared = [];
        const errors: string[] = [];
        for (const row of rows) {
          const { wilayaCode, row: line, ...record } = row;
          const parentId =
            kind === 'countries'
              ? null
              : kind === 'wilayas'
                ? input.countryId!
                : parents.find((p) => p.code === wilayaCode)?.id;
          if (parentId === undefined) {
            errors.push(
              `Row ${line}: wilayaId ${wilayaCode} is not in the selected country.`,
            );
            continue;
          }
          prepared.push({
            ...record,
            parentId,
            kind,
            scope: parentId ?? 'ROOT',
          });
        }
        if (errors.length)
          return {
            data: {
              valid: false,
              errors: errors.slice(0, 50),
              count: 0,
              rows: [],
            },
            meta: {},
          };
        if (apply) {
          for (const row of prepared)
            await tx.geoZone.upsert({
              where: {
                kind_scope_code: { kind, scope: row.scope, code: row.code },
              },
              create: row,
              update: {
                nameEnglish: row.nameEnglish,
                nameFrench: row.nameFrench,
                nameArabic: row.nameArabic,
                zone: row.zone,
                isDeliverable: row.isDeliverable,
              },
            });
          await tx.auditLog.createMany({
            data: [
              {
                actorId: actor.userId,
                action: 'ADMIN_GEOGRAPHY_IMPORTED',
                resourceType: 'GEOGRAPHY',
                metadata: { requestId, kind, count: prepared.length },
              },
            ],
          });
        }
        return {
          data: {
            valid: true,
            errors: [],
            count: prepared.length,
            applied: apply,
            rows: prepared.slice(0, 20),
          },
          meta: {},
        };
      },
      { timeout: 120000 },
    );
  }
}
