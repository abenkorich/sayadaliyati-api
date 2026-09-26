import type { SchemaObject } from '@nestjs/swagger';
const text: SchemaObject = { type: 'string', nullable: true };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const summary = object({
  id: uuid,
  name: { type: 'string' },
  brandName: text,
  genericName: text,
  strength: text,
  dosageForm: text,
  boxImageUrl: { ...text, format: 'uri' },
  category: {
    ...object({ id: uuid, slug: { type: 'string' }, name: { type: 'string' } }),
    nullable: true,
  },
  registrationHolder: text,
  holderCountry: text,
  regulatoryStatus: { ...text, enum: ['CURRENT', 'NOT_RENEWED', 'WITHDRAWN'] },
  status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'] },
  manufacturer: {
    ...object({ id: uuid, name: { type: 'string' } }),
    nullable: true,
  },
});
const detail = object({
  ...summary.properties,
  miph: {
    ...object({
      sourceUrl: { ...text, format: 'uri' },
      sheet: text,
      row: { type: 'integer', nullable: true },
      checksum: text,
      fields: {
        type: 'array',
        items: object({
          name: { type: 'string' },
          value: {
            nullable: true,
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
            ],
          },
          numberFormat: text,
          displayValue: text,
        }),
      },
    }),
    nullable: true,
  },
  route: text,
  packageSize: text,
  registrationNumber: text,
  regulatoryStatus: { ...text, enum: ['CURRENT', 'NOT_RENEWED', 'WITHDRAWN'] },
  registrationHolder: text,
  holderCountry: text,
  country: text,
  description: text,
  source: text,
  sourceVersion: text,
  sourceUpdatedAt: { ...text, format: 'date-time' },
  ingredients: {
    type: 'array',
    items: object({
      id: uuid,
      name: { type: 'string' },
      amount: {
        ...text,
        description: 'Exact decimal string, or null when unknown',
      },
      unit: text,
    }),
  },
  barcodes: {
    type: 'array',
    items: object({
      barcode: { type: 'string' },
      barcodeType: {
        type: 'string',
        enum: ['EAN13', 'EAN8', 'UPC', 'GTIN', 'QR', 'OTHER'],
      },
      country: text,
    }),
  },
  images: {
    type: 'array',
    items: object({
      url: { type: 'string', format: 'uri' },
      imageType: {
        type: 'string',
        enum: ['FRONT', 'BACK', 'SIDE', 'PACKAGE', 'OTHER'],
      },
      sortOrder: { type: 'integer', minimum: 0 },
      source: text,
    }),
  },
});
export const medicineDetailResponse = object({
  data: detail,
  meta: object({}),
});
export const medicineListResponse = object({
  data: { type: 'array', items: summary },
  meta: object({
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  }),
});
