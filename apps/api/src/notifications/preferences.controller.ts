import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  notificationPreferencesSchema,
  notificationPreferencesPatchSchema,
} from '@saydaliyati/validation';
import { actor } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { errorResponse } from '../auth/openapi.js';
import { NotificationPreferencesService } from './preferences.service.js';
const response: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'meta'],
  properties: {
    data: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['configured', 'preferences'],
          properties: {
            configured: { type: 'boolean', enum: [false] },
            preferences: { type: 'object', nullable: true, enum: [null] },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['configured', 'preferences'],
          properties: {
            configured: { type: 'boolean', enum: [true] },
            preferences: z.toJSONSchema(notificationPreferencesSchema, {
              target: 'openapi-3.0',
            }) as SchemaObject,
          },
        },
      ],
    },
    meta: { type: 'object', additionalProperties: false },
  },
};
@ApiTags('Notification preferences')
@ApiBearerAuth()
@ApiResponse({ status: 200, schema: response })
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 429, schema: errorResponse })
@ApiResponse({ status: 503, schema: errorResponse })
@Controller('me/notification-preferences')
export class NotificationPreferencesController {
  constructor(
    @Inject(NotificationPreferencesService)
    private readonly preferences: NotificationPreferencesService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'Read own explicit settings; unconfigured does not imply delivery consent',
  })
  get(@Req() request: AuthRequest) {
    return this.preferences.get(actor(request));
  }
  @Patch()
  @ApiOperation({
    summary:
      'Save own settings; first configuration requires all five flags; no notification is sent',
  })
  @ApiBody({
    schema: z.toJSONSchema(notificationPreferencesPatchSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  patch(@Body() body: unknown, @Req() request: AuthRequest) {
    const result = notificationPreferencesPatchSchema.safeParse(body);
    if (!result.success) throw new ApiError('VALIDATION_ERROR');
    return this.preferences.patch(
      actor(request),
      result.data,
      request.requestId,
    );
  }
}
