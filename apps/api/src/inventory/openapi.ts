import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  inventoryCreateSchema,
  inventoryPatchSchema,
} from '@saydaliyati/validation';

const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const nullableText: SchemaObject = { type: 'string', nullable: true };
const decimal: SchemaObject = {
  type: 'string',
  pattern: '^\\d+(\\.\\d{1,3})?$',
  description: 'Exact nonnegative decimal with up to three fractional digits',
};
const item = object({
  id: uuid,
  medicineId: uuid,
  quantity: decimal,
  unit: {
    type: 'string',
    enum: [
      'TABLET',
      'CAPSULE',
      'ML',
      'MG',
      'G',
      'DOSE',
      'SACHET',
      'AMPOULE',
      'VIAL',
      'SUPPOSITORY',
      'DROP',
      'PATCH',
      'OTHER',
    ],
  },
  batchNumber: nullableText,
  expiryDate: { ...nullableText, format: 'date' },
  purchaseDate: { ...nullableText, format: 'date' },
  storageLocation: nullableText,
  source: {
    ...nullableText,
    enum: ['MANUAL', 'SCAN', 'PRESCRIPTION', 'IMPORT', 'OTHER'],
  },
  notes: nullableText,
  lowStockThreshold: { ...decimal, nullable: true },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
  isLowStock: {
    type: 'boolean',
    description:
      'True only when a threshold is set and quantity is at or below it in this record’s unit',
  },
  medicine: object({
    id: uuid,
    name: { type: 'string' },
    boxImageUrl: { ...nullableText, format: 'uri' },
    category: {
      ...object({
        id: uuid,
        slug: { type: 'string' },
        name: { type: 'string' },
      }),
      nullable: true,
    },
    brandName: nullableText,
    genericName: nullableText,
    strength: nullableText,
    dosageForm: nullableText,
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'] },
  }),
});
export const inventoryResponse = object({ data: item, meta: object({}) });
export const inventoryListResponse = object({
  data: { type: 'array', items: item },
  meta: object({
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  }),
});
const body = (schema: z.ZodType) =>
  z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  }) as SchemaObject;
export const createBody = body(inventoryCreateSchema);
export const patchBody = { ...body(inventoryPatchSchema), minProperties: 1 };
