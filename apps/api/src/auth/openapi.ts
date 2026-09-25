import type { SchemaObject } from '@nestjs/swagger';

const emptyMeta: SchemaObject = { type: 'object', additionalProperties: false };
const tokenFields: Record<string, SchemaObject> = {
  accessToken: {
    type: 'string',
    description: 'Short-lived bearer access token',
  },
  refreshToken: {
    type: 'string',
    description: 'Single-use refresh token; serialize refresh requests',
  },
};
export const tokenResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: {
      type: 'object',
      required: ['accessToken', 'refreshToken'],
      properties: tokenFields,
    },
    meta: emptyMeta,
  },
};
export const loginResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: {
      type: 'object',
      required: ['user', 'accessToken', 'refreshToken'],
      properties: {
        ...tokenFields,
        user: {
          type: 'object',
          required: ['id', 'role'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            role: {
              type: 'string',
              enum: ['PATIENT', 'DOCTOR', 'PHARMACY', 'ADMIN'],
            },
          },
        },
      },
    },
    meta: emptyMeta,
  },
};
export const profileResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: {
      type: 'object',
      required: [
        'firstName',
        'lastName',
        'preferredLanguage',
        'timezone',
        'email',
        'phone',
      ],
      additionalProperties: false,
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        preferredLanguage: { type: 'string', enum: ['EN', 'FR', 'AR'] },
        timezone: { type: 'string' },
        email: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
      },
    },
    meta: emptyMeta,
  },
};
export const emptyResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: { data: emptyMeta, meta: emptyMeta },
};
export const errorResponse: SchemaObject = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'details'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: emptyMeta,
      },
    },
  },
};
