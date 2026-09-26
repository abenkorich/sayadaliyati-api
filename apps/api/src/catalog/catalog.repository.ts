import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import type { MedicineQuery } from '@saydaliyati/validation';
import { DatabaseService } from '../database.service.js';

const summary = {
  id: true,
  boxImageUrl: true,
  category: { select: { id: true, slug: true, name: true } },
  name: true,
  brandName: true,
  genericName: true,
  strength: true,
  dosageForm: true,
  status: true,
  regulatoryStatus: true,
  registrationHolder: true,
  holderCountry: true,
  manufacturer: { select: { id: true, name: true } },
} as const satisfies Prisma.MedicineSelect;
const detail = {
  ...summary,
  route: true,
  packageSize: true,
  registrationNumber: true,
  regulatoryStatus: true,
  registrationHolder: true,
  holderCountry: true,
  country: true,
  description: true,
  source: true,
  sourceVersion: true,
  sourceMetadata: true,
  sourceChecksum: true,
  sourceUpdatedAt: true,
  ingredients: {
    select: {
      amount: true,
      unit: true,
      ingredient: { select: { id: true, name: true } },
    },
    orderBy: { ingredientId: 'asc' },
  },
  barcodes: {
    select: { barcode: true, barcodeType: true, country: true },
    orderBy: { barcode: 'asc' },
  },
  images: {
    select: { url: true, imageType: true, sortOrder: true, source: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.MedicineSelect;

// Prisma parameterizes values; escaping also makes LIKE metacharacters literal.
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');
@Injectable()
export class CatalogRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async search(query: MedicineQuery) {
    const contains = query.q
      ? { contains: literal(query.q), mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.MedicineWhereInput = {
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.laboratory ? { registrationHolder: query.laboratory } : {}),
      ...(query.holderCountry ? { holderCountry: query.holderCountry } : {}),
      ...(query.dosageForm ? { dosageForm: query.dosageForm } : {}),
      ...(query.regulatoryStatus
        ? { regulatoryStatus: query.regulatoryStatus }
        : {}),
      ...(query.barcode
        ? { barcodes: { some: { barcode: query.barcode } } }
        : {}),
      ...(query.category
        ? {
            categoryId:
              query.category === 'uncategorized' ? null : query.category,
          }
        : {}),
      ...(query.manufacturer ? { manufacturerId: query.manufacturer } : {}),
      ...(query.ingredient
        ? { ingredients: { some: { ingredientId: query.ingredient } } }
        : {}),
      ...(contains
        ? {
            OR: [
              { normalizedName: contains },
              { brandName: contains },
              { genericName: contains },
              { registrationHolder: contains },
              { holderCountry: contains },
              { registrationNumber: contains },
              { strength: contains },
              { dosageForm: contains },
              { packageSize: contains },
              { route: contains },
              { category: { name: contains } },
              { manufacturer: { name: contains } },
              { barcodes: { some: { barcode: query.q! } } },
              ...[
                'CODE',
                'LISTE',
                'TYPE',
                'STATUT',
                'P1',
                'P2',
                'OBS',
                'DUREE DE STABILITE',
                'MOTIF DE RETRAIT',
              ].map((field) => ({
                sourceMetadata: {
                  path: ['raw', field],
                  string_contains: literal(query.q!),
                  mode: 'insensitive' as const,
                },
              })),
              {
                ingredients: {
                  some: { ingredient: { normalizedName: contains } },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.db.client.$transaction(
      [
        this.db.client.medicine.findMany({
          where,
          select: summary,
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.client.medicine.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async filters() {
    const [laboratories, countries, dosageForms] = await Promise.all([
      this.db.client.medicine.findMany({
        select: { registrationHolder: true },
        distinct: ['registrationHolder'],
        where: { registrationHolder: { not: null } },
        orderBy: { registrationHolder: 'asc' },
      }),
      this.db.client.medicine.findMany({
        select: { holderCountry: true },
        distinct: ['holderCountry'],
        where: { holderCountry: { not: null } },
        orderBy: { holderCountry: 'asc' },
      }),
      this.db.client.medicine.findMany({
        select: { dosageForm: true },
        distinct: ['dosageForm'],
        where: { dosageForm: { not: null } },
        orderBy: { dosageForm: 'asc' },
      }),
    ]);
    return {
      laboratories: laboratories.flatMap((r) =>
        r.registrationHolder ? [r.registrationHolder] : [],
      ),
      countries: countries.flatMap((r) =>
        r.holderCountry ? [r.holderCountry] : [],
      ),
      dosageForms: dosageForms.flatMap((r) =>
        r.dosageForm ? [r.dosageForm] : [],
      ),
    };
  }
  categories() {
    return this.db.client.medicineCategory.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  byId(id: string) {
    return this.db.client.medicine.findUnique({
      where: { id },
      select: detail,
    });
  }
  async byBarcode(barcode: string) {
    const match = await this.db.client.medicineBarcode.findUnique({
      where: { barcode },
      select: { medicine: { select: detail } },
    });
    return match?.medicine ?? null;
  }
}
