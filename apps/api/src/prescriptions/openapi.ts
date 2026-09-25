import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  prescriptionCreateSchema,
  prescriptionReviewSchema,
  prescriptionFieldNames,
} from '@saydaliyati/validation';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const text: SchemaObject = { type: 'string', nullable: true };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const decimal: SchemaObject = {
  ...text,
  description: 'Exact positive decimal string, or null when unknown',
};
const header = {
  id: uuid,
  prescriptionDate: { ...text, format: 'date' },
  validUntil: { ...text, format: 'date' },
  source: {
    type: 'string',
    enum: ['SCANNED', 'MANUAL', 'SHARED', 'DIGITAL'],
  } as SchemaObject,
  status: {
    type: 'string',
    enum: ['DRAFT', 'CONFIRMED', 'ARCHIVED'],
  } as SchemaObject,
  processingStatus: {
    ...text,
    enum: [
      'UPLOADED',
      'QUEUED',
      'PROCESSING',
      'REVIEW_REQUIRED',
      'COMPLETED',
      'FAILED',
    ],
  },
  createdAt: { type: 'string', format: 'date-time' } as SchemaObject,
  updatedAt: { type: 'string', format: 'date-time' } as SchemaObject,
};
const field = object({
  id: uuid,
  fieldName: { type: 'string', enum: prescriptionFieldNames },
  revision: { type: 'integer', minimum: 1 },
  value: {
    oneOf: [
      { type: 'string', nullable: true },
      { type: 'number' },
      { type: 'array', items: { type: 'string' } },
    ],
  },
  source: { type: 'string', enum: ['OCR', 'AI', 'USER', 'PROFESSIONAL'] },
  confidence: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
  confirmed: { type: 'boolean' },
  confirmedAt: { ...text, format: 'date-time' },
});
export const prescriptionResponse = object({
  data: object({
    ...header,
    medications: {
      type: 'array',
      items: object({
        id: uuid,
        medicineId: { ...uuid, nullable: true },
        extractedName: text,
        dosage: decimal,
        dosageUnit: text,
        frequency: decimal,
        frequencyUnit: text,
        duration: decimal,
        durationUnit: text,
        quantity: decimal,
        instructions: text,
        confidence: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
        confirmationStatus: {
          type: 'string',
          enum: ['PENDING', 'CONFIRMED', 'REJECTED'],
        },
        medicine: {
          ...object({
            id: uuid,
            name: { type: 'string' },
            strength: text,
            dosageForm: text,
            status: {
              type: 'string',
              enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
            },
          }),
          nullable: true,
        },
        fields: { type: 'array', items: field },
      }),
    },
    documents: {
      type: 'array',
      items: object({
        id: uuid,
        pageNumber: { type: 'integer', minimum: 1 },
        mimeType: { type: 'string' },
        processingStatus: {
          type: 'string',
          enum: [
            'UPLOADED',
            'QUEUED',
            'PROCESSING',
            'REVIEW_REQUIRED',
            'COMPLETED',
            'FAILED',
          ],
        },
      }),
    },
  }),
  meta: object({}),
});
export const prescriptionListResponse = object({
  data: {
    type: 'array',
    items: object({
      ...header,
      medicationCount: { type: 'integer', minimum: 0 },
    }),
  },
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
export const prescriptionCreateBody = body(prescriptionCreateSchema);
export const prescriptionReviewBody = {
  ...body(prescriptionReviewSchema),
  minProperties: 1,
};
