import { z } from 'zod';
import { Prisma } from '@saydaliyati/database';
import { normalizeCatalogText } from '@saydaliyati/validation';
import { medicineSchema } from './admin.schemas.js';
import type { TransferRow, Issue } from './transfer-format.js';
export const medicineJsonColumns = [
  'sourceMetadata',
  'ingredients',
  'barcodes',
  'images',
];
export const medicineColumns = [
  'id',
  'name',
  'brandName',
  'genericName',
  'strength',
  'dosageForm',
  'route',
  'packageSize',
  'categoryId',
  'categorySlug',
  'categoryName',
  'manufacturerId',
  'manufacturerName',
  'manufacturerCountry',
  'manufacturerWebsite',
  'registrationNumber',
  'regulatoryStatus',
  'registrationHolder',
  'holderCountry',
  'country',
  'description',
  'boxImageUrl',
  'status',
  'source',
  'sourceVersion',
  'sourceChecksum',
  'sourceUpdatedAt',
  ...medicineJsonColumns,
  'normalizedName',
  'createdAt',
  'updatedAt',
] as const;
export const medicineReadOnly = ['normalizedName', 'createdAt', 'updatedAt'];
const text = (max: number) => z.string().max(max).nullable().optional();
const uuid = z.string().uuid().nullable().optional();
const url = z
  .url()
  .max(10000)
  .regex(/^https:\/\/[^\s]+$/);
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString())
  .nullable()
  .optional();
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
function jsonCell<T extends z.ZodType>(schema: T) {
  return z
    .preprocess((v) => {
      if (typeof v !== 'string') return v;
      try {
        return JSON.parse(v);
      } catch {
        return Symbol('invalid JSON');
      }
    }, schema.nullable())
    .transform((v) => (v === null ? null : canonical(v)))
    .optional();
}
const ingredient = z
  .object({
    ingredientId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(255),
    description: z.string().max(100000).nullable().optional(),
    amount: z
      .union([
        z.string().regex(/^\d{1,8}(\.\d{1,4})?$/),
        z.number().finite().nonnegative().max(99999999.9999),
      ])
      .transform((v) => new Prisma.Decimal(v).toString())
      .refine((v) => new Prisma.Decimal(v).decimalPlaces() <= 4)
      .nullable(),
    unit: z.string().max(50).nullable(),
  })
  .strict();
const barcode = z
  .object({
    barcode: z
      .string()
      .regex(/^[!-~]+$/)
      .max(100),
    barcodeType: z.enum(['EAN13', 'EAN8', 'UPC', 'GTIN', 'QR', 'OTHER']),
    country: z.string().max(10).nullable(),
  })
  .strict();
const image = z
  .object({
    url,
    imageType: z.enum(['FRONT', 'BACK', 'SIDE', 'PACKAGE', 'OTHER']),
    sortOrder: z.number().int().min(0).max(2147483647),
    source: z.string().max(150).nullable(),
  })
  .strict();
export const medicineTransferSchema = medicineSchema
  .extend({
    id: z.string().uuid().optional(),
    source: z.string().trim().min(1).max(150).nullable(),
    strength: z.string().max(100000).nullable(),
    brandName: text(255),
    route: text(100),
    packageSize: text(100000),
    registrationNumber: text(150),
    country: text(100),
    description: text(100000),
    boxImageUrl: url.nullable().optional(),
    sourceVersion: text(100),
    regulatoryStatus: z
      .enum(['CURRENT', 'NOT_RENEWED', 'WITHDRAWN'])
      .nullable()
      .optional(),
    registrationHolder: text(100000),
    holderCountry: text(100000),
    sourceChecksum: text(64),
    sourceUpdatedAt: timestamp,
    categoryId: uuid,
    categorySlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100)
      .nullable()
      .optional(),
    categoryName: z.string().trim().min(1).max(150).nullable().optional(),
    manufacturerId: uuid,
    manufacturerName: z.string().trim().min(1).max(255).nullable().optional(),
    manufacturerCountry: text(100),
    manufacturerWebsite: z
      .url()
      .max(500)
      .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol))
      .nullable()
      .optional(),
    sourceMetadata: jsonCell(z.record(z.string(), z.unknown())),
    ingredients: jsonCell(
      z
        .array(ingredient)
        .max(100)
        .refine(
          (v) =>
            new Set(
              v.map((i) => i.ingredientId ?? normalizeCatalogText(i.name)),
            ).size === v.length,
          'Duplicate ingredients.',
        )
        .transform((v) => v.sort((a, b) => a.name.localeCompare(b.name))),
    ),
    barcodes: jsonCell(
      z
        .array(barcode)
        .max(100)
        .refine(
          (v) => new Set(v.map((i) => i.barcode)).size === v.length,
          'Duplicate barcodes.',
        )
        .transform((v) => v.sort((a, b) => a.barcode.localeCompare(b.barcode))),
    ),
    images: jsonCell(
      z
        .array(image)
        .max(100)
        .transform((v) =>
          v.sort(
            (a, b) => a.sortOrder - b.sortOrder || a.url.localeCompare(b.url),
          ),
        ),
    ),
    normalizedName: text(255),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .refine((v) => !!v.id || !!v.source, {
    path: ['source'],
    message: 'A source is required for a new medicine.',
  });
export const medicineTransferSelect = {
  id: true,
  name: true,
  normalizedName: true,
  brandName: true,
  genericName: true,
  strength: true,
  dosageForm: true,
  route: true,
  packageSize: true,
  registrationNumber: true,
  status: true,
  country: true,
  description: true,
  source: true,
  sourceVersion: true,
  regulatoryStatus: true,
  registrationHolder: true,
  holderCountry: true,
  sourceChecksum: true,
  sourceMetadata: true,
  sourceUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  boxImageUrl: true,
  categoryId: true,
  manufacturerId: true,
  category: { select: { id: true, slug: true, name: true } },
  manufacturer: {
    select: { id: true, name: true, country: true, website: true },
  },
  ingredients: {
    select: {
      amount: true,
      unit: true,
      ingredient: { select: { id: true, name: true, description: true } },
    },
    orderBy: { ingredientId: 'asc' },
  },
  barcodes: {
    select: { barcode: true, barcodeType: true, country: true },
    orderBy: { barcode: 'asc' },
  },
  images: {
    select: { url: true, imageType: true, sortOrder: true, source: true },
    orderBy: [{ sortOrder: 'asc' }, { url: 'asc' }],
  },
} as const satisfies Prisma.MedicineSelect;
type Record = Prisma.MedicineGetPayload<{
  select: typeof medicineTransferSelect;
}>;
export function medicineTransferRow(record: Record): TransferRow {
  const { category, manufacturer, ingredients, barcodes, images, ...base } =
    record;
  return {
    ...JSON.parse(JSON.stringify(base)),
    categorySlug: category?.slug ?? null,
    categoryName: category?.name ?? null,
    manufacturerName: manufacturer?.name ?? null,
    manufacturerCountry: manufacturer?.country ?? null,
    manufacturerWebsite: manufacturer?.website ?? null,
    sourceMetadata:
      record.sourceMetadata === null ? null : canonical(record.sourceMetadata),
    ingredients: canonical(
      ingredients
        .map((i) => ({
          ingredientId: i.ingredient.id,
          name: i.ingredient.name,
          description: i.ingredient.description,
          amount: i.amount?.toString() ?? null,
          unit: i.unit,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
    barcodes: canonical(
      [...barcodes].sort((a, b) => a.barcode.localeCompare(b.barcode)),
    ),
    images: canonical(
      [...images].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.url.localeCompare(b.url),
      ),
    ),
  };
}
const array = <T>(value: string | null | undefined): T[] =>
  value ? JSON.parse(value) : [];
type Ingredient = z.infer<typeof ingredient>;
type Barcode = z.infer<typeof barcode>;
type Image = z.infer<typeof image>;
export async function medicineReferences(
  tx: Prisma.TransactionClient,
  rows: TransferRow[],
  existingRows: TransferRow[] = [],
) {
  const ids = (key: string) => rows.flatMap((r) => (r[key] ? [r[key]!] : []));
  const ingredients = rows.flatMap((r) => array<Ingredient>(r.ingredients));
  const categories = await tx.medicineCategory.findMany({
    where: {
      OR: [
        { id: { in: ids('categoryId') } },
        { slug: { in: ids('categorySlug') } },
        { name: { in: ids('categoryName') } },
      ],
    },
    orderBy: { id: 'asc' },
  });
  const manufacturers = await tx.manufacturer.findMany({
    where: {
      OR: [
        { id: { in: ids('manufacturerId') } },
        {
          normalizedName: {
            in: ids('manufacturerName').map(normalizeCatalogText),
          },
        },
      ],
    },
    orderBy: { id: 'asc' },
  });
  const activeIngredients = await tx.activeIngredient.findMany({
    where: {
      OR: [
        {
          id: {
            in: ingredients.flatMap((i) =>
              i.ingredientId ? [i.ingredientId] : [],
            ),
          },
        },
        {
          normalizedName: {
            in: ingredients.map((i) => normalizeCatalogText(i.name)),
          },
        },
      ],
    },
    orderBy: { id: 'asc' },
  });
  const barcodes = await tx.medicineBarcode.findMany({
    where: {
      barcode: {
        in: rows.flatMap((r) =>
          array<Barcode>(r.barcodes).map((b) => b.barcode),
        ),
      },
    },
    orderBy: { barcode: 'asc' },
  });
  const effective = rows.map((r) => ({
    ...existingRows.find((e) => e.id === r.id),
    ...r,
  }));
  const registrations = await tx.medicine.findMany({
    where: {
      source: 'MIPH',
      registrationNumber: {
        in: effective.flatMap((r) =>
          r.source === 'MIPH' && r.registrationNumber
            ? [r.registrationNumber]
            : [],
        ),
      },
    },
    select: { id: true, registrationNumber: true },
    orderBy: { id: 'asc' },
  });
  return {
    categories,
    manufacturers,
    activeIngredients,
    barcodes,
    registrations,
  };
}
type References = Awaited<ReturnType<typeof medicineReferences>>;
export function medicineReferenceIssues(
  rows: TransferRow[],
  refs: References,
  existingRows: TransferRow[] = [],
): Issue[] {
  const issues: Issue[] = [];
  const batch = new Map<string, string>();
  const check = (
    row: number,
    key: string,
    identity: string,
    value: unknown,
  ) => {
    const v = canonical(value),
      old = batch.get(key + identity);
    if (old !== undefined && old !== v)
      issues.push({
        row,
        field: key,
        message:
          'Conflicting details for the same shared catalog record in this file.',
      });
    batch.set(key + identity, v);
  };
  const usedBarcodes = new Set<string>();
  const usedRegistrations = new Set<string>();
  rows.forEach((r, index) => {
    const issue = (field: string, message: string) =>
      issues.push({ row: index + 1, field, message });
    const effective = { ...existingRows.find((e) => e.id === r.id), ...r };
    if (
      effective.status === 'ACTIVE' &&
      ['NOT_RENEWED', 'WITHDRAWN'].includes(effective.regulatoryStatus ?? '')
    )
      issue('status', 'Withdrawn or non-renewed medicines cannot be ACTIVE.');
    if (effective.source === 'MIPH' && effective.registrationNumber) {
      const old = refs.registrations.find(
        (m) => m.registrationNumber === effective.registrationNumber,
      );
      if (
        (old && old.id !== r.id) ||
        usedRegistrations.has(effective.registrationNumber)
      )
        issue(
          'registrationNumber',
          'This MIPH registration number belongs to another medicine or appears twice in this file.',
        );
      usedRegistrations.add(effective.registrationNumber);
    }
    const candidates = r.categoryId
      ? refs.categories.filter((c) => c.id === r.categoryId)
      : r.categorySlug
        ? refs.categories.filter((c) => c.slug === r.categorySlug)
        : r.categoryName
          ? refs.categories.filter((c) => c.name === r.categoryName)
          : [];
    const c = candidates[0];
    if (r.categoryId && !c) issue('categoryId', 'Category ID does not exist.');
    else if (candidates.length > 1)
      issue(
        'categoryName',
        'Category name is ambiguous. Supply categoryId or categorySlug.',
      );
    else if (c) {
      if (
        (r.categorySlug && r.categorySlug !== c.slug) ||
        (r.categoryName && r.categoryName !== c.name)
      )
        issue(
          'categoryName',
          'Category details conflict with the existing category. Use its exact slug and name.',
        );
    } else if (r.categorySlug || r.categoryName) {
      if (!r.categorySlug || !r.categoryName)
        issue(
          'categoryName',
          'A new category requires both categorySlug and categoryName.',
        );
      else check(index + 1, 'category', r.categorySlug, r.categoryName);
    }
    const m = r.manufacturerId
      ? refs.manufacturers.filter((m) => m.id === r.manufacturerId)
      : r.manufacturerName
        ? refs.manufacturers.filter(
            (m) =>
              m.normalizedName === normalizeCatalogText(r.manufacturerName!),
          )
        : [];
    if (r.manufacturerId && !m.length)
      issue('manufacturerId', 'Manufacturer ID does not exist.');
    else if (m.length > 1)
      issue(
        'manufacturerName',
        'Manufacturer name is ambiguous. Supply manufacturerId.',
      );
    else if (m[0]) {
      for (const [field, key] of [
        ['manufacturerName', 'name'],
        ['manufacturerCountry', 'country'],
        ['manufacturerWebsite', 'website'],
      ] as const)
        if (field in r && r[field] !== m[0][key])
          issue(
            field,
            'Shared manufacturer details differ. Use the existing values or a different manufacturer.',
          );
    } else if (r.manufacturerName)
      check(
        index + 1,
        'manufacturer',
        normalizeCatalogText(r.manufacturerName),
        [
          r.manufacturerName,
          r.manufacturerCountry ?? null,
          r.manufacturerWebsite ?? null,
        ],
      );
    else if (r.manufacturerCountry || r.manufacturerWebsite)
      issue('manufacturerName', 'A manufacturer name or ID is required.');
    const seenIngredients = new Set<string>();
    for (const i of array<Ingredient>(r.ingredients)) {
      const found = i.ingredientId
        ? refs.activeIngredients.find((a) => a.id === i.ingredientId)
        : refs.activeIngredients.find(
            (a) => a.normalizedName === normalizeCatalogText(i.name),
          );
      const identity = found?.id ?? normalizeCatalogText(i.name);
      if (seenIngredients.has(identity))
        issue('ingredients', 'Duplicate ingredient reference.');
      seenIngredients.add(identity);
      if (i.ingredientId && !found)
        issue('ingredients', 'Ingredient ID does not exist.');
      else if (
        found &&
        (found.name !== i.name ||
          ('description' in i && found.description !== i.description))
      )
        issue(
          'ingredients',
          'Shared ingredient details differ. Use the existing name and description.',
        );
      else if (!found)
        check(index + 1, 'ingredients', normalizeCatalogText(i.name), [
          i.name,
          i.description ?? null,
        ]);
    }
    for (const b of array<Barcode>(r.barcodes)) {
      const old = refs.barcodes.find((x) => x.barcode === b.barcode);
      if (old && old.medicineId !== r.id)
        issue(
          'barcodes',
          `Barcode ${b.barcode} already belongs to another medicine.`,
        );
      if (usedBarcodes.has(b.barcode))
        issue('barcodes', `Barcode ${b.barcode} appears in multiple rows.`);
      usedBarcodes.add(b.barcode);
    }
  });
  return issues.slice(0, 100);
}
export async function saveMedicineTransfer(
  tx: Prisma.TransactionClient,
  row: TransferRow,
) {
  const data = medicineTransferSchema.parse(row);
  const refs = await medicineReferences(tx, [row]);
  // The preview and serializable transaction already validated these references.
  const values: Prisma.MedicineUncheckedCreateInput = {
    name: data.name,
    normalizedName: normalizeCatalogText(data.name),
    genericName: data.genericName,
    strength: data.strength,
    dosageForm: data.dosageForm,
    status: data.status,
    source: data.source,
  };
  for (const key of [
    'brandName',
    'route',
    'packageSize',
    'registrationNumber',
    'country',
    'description',
    'boxImageUrl',
    'sourceVersion',
    'regulatoryStatus',
    'registrationHolder',
    'holderCountry',
    'sourceChecksum',
  ] as const)
    if (data[key] !== undefined) values[key] = data[key];
  if ('sourceUpdatedAt' in data)
    values.sourceUpdatedAt = data.sourceUpdatedAt
      ? new Date(data.sourceUpdatedAt)
      : null;
  if ('sourceMetadata' in data)
    values.sourceMetadata = data.sourceMetadata
      ? JSON.parse(data.sourceMetadata)
      : Prisma.DbNull;
  if (['categoryId', 'categorySlug', 'categoryName'].some((k) => k in row)) {
    const existing = data.categoryId
      ? refs.categories.find((c) => c.id === data.categoryId)
      : data.categorySlug
        ? refs.categories.find((c) => c.slug === data.categorySlug)
        : refs.categories.find((c) => c.name === data.categoryName);
    values.categoryId =
      existing?.id ??
      (data.categorySlug && data.categoryName
        ? (
            await tx.medicineCategory.create({
              data: { slug: data.categorySlug, name: data.categoryName },
              select: { id: true },
            })
          ).id
        : null);
  }
  if (
    [
      'manufacturerId',
      'manufacturerName',
      'manufacturerCountry',
      'manufacturerWebsite',
    ].some((k) => k in row)
  ) {
    const existing = data.manufacturerId
      ? refs.manufacturers.find((m) => m.id === data.manufacturerId)
      : refs.manufacturers.find(
          (m) =>
            m.normalizedName ===
            normalizeCatalogText(data.manufacturerName ?? ''),
        );
    values.manufacturerId =
      existing?.id ??
      (data.manufacturerName
        ? (
            await tx.manufacturer.create({
              data: {
                name: data.manufacturerName,
                normalizedName: normalizeCatalogText(data.manufacturerName),
                country: data.manufacturerCountry ?? null,
                website: data.manufacturerWebsite ?? null,
              },
              select: { id: true },
            })
          ).id
        : null);
  }
  const saved = data.id
    ? await tx.medicine.update({
        where: { id: data.id },
        data: values,
        select: { id: true },
      })
    : await tx.medicine.create({ data: values, select: { id: true } });
  if ('ingredients' in data) {
    await tx.medicineIngredient.deleteMany({ where: { medicineId: saved.id } });
    for (const i of array<Ingredient>(data.ingredients)) {
      const existing = i.ingredientId
        ? refs.activeIngredients.find((a) => a.id === i.ingredientId)
        : refs.activeIngredients.find(
            (a) => a.normalizedName === normalizeCatalogText(i.name),
          );
      const ingredientId =
        existing?.id ??
        (
          await tx.activeIngredient.create({
            data: {
              name: i.name,
              normalizedName: normalizeCatalogText(i.name),
              description: i.description ?? null,
            },
            select: { id: true },
          })
        ).id;
      await tx.medicineIngredient.create({
        data: {
          medicineId: saved.id,
          ingredientId,
          amount: i.amount,
          unit: i.unit,
        },
      });
    }
  }
  if ('barcodes' in data) {
    await tx.medicineBarcode.deleteMany({ where: { medicineId: saved.id } });
    const rows = array<Barcode>(data.barcodes);
    if (rows.length)
      await tx.medicineBarcode.createMany({
        data: rows.map((b) => ({ ...b, medicineId: saved.id })),
      });
  }
  if ('images' in data) {
    await tx.medicineImage.deleteMany({ where: { medicineId: saved.id } });
    const rows = array<Image>(data.images);
    if (rows.length)
      await tx.medicineImage.createMany({
        data: rows.map((i) => ({ ...i, medicineId: saved.id })),
      });
  }
  return saved.id;
}
