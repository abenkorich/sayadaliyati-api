import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  medicineIdSchema,
  notificationQuerySchema,
  notificationReadSchema,
} from '@saydaliyati/validation';
import { actor } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { errorResponse } from '../auth/openapi.js';
import { NotificationInbox } from './inbox.service.js';
const parse = <T>(schema: z.ZodType<T>, value: unknown) => {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError('VALIDATION_ERROR');
  return r.data;
};
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const integer: SchemaObject = { type: 'integer', minimum: 0 },
  uuid: SchemaObject = { type: 'string', format: 'uuid' },
  time: SchemaObject = { type: 'string', format: 'date-time' };
const item = object({
  id: uuid,
  type: { type: 'string', enum: ['DOSE_DUE'] },
  title: { type: 'string' },
  body: { type: 'string' },
  data: object({ treatmentId: uuid, occurrenceId: uuid }),
  readAt: { ...time, nullable: true },
  createdAt: time,
});
const readResponse = object({
  data: object({ updatedCount: integer }),
  meta: object({}),
});
@ApiTags('Notification inbox')
@ApiBearerAuth()
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 404, schema: errorResponse })
@ApiResponse({ status: 429, schema: errorResponse })
@Controller('me/notifications')
export class NotificationInboxController {
  constructor(
    @Inject(NotificationInbox) private readonly inbox: NotificationInbox,
  ) {}
  @Get()
  @ApiOperation({ summary: 'List own delivered inbox reminders' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'unread', required: false, enum: ['true', 'false'] })
  @ApiResponse({
    status: 200,
    schema: object({
      data: { type: 'array', items: item },
      meta: object({
        page: integer,
        limit: integer,
        total: integer,
        totalPages: integer,
      }),
    }),
  })
  list(@Query() query: unknown, @Req() request: AuthRequest) {
    return this.inbox.list(
      actor(request),
      parse(notificationQuerySchema, query),
    );
  }
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark own currently unread notifications as read' })
  @ApiBody({ schema: object({}), required: false })
  @ApiResponse({ status: 200, schema: readResponse })
  all(@Body() body: unknown, @Req() request: AuthRequest) {
    parse(notificationReadSchema, body ?? {});
    return this.inbox.read(actor(request), undefined, request.requestId);
  }
  @Patch(':id/read')
  @ApiParam({ name: 'id', schema: uuid })
  @ApiOperation({ summary: 'Idempotently mark an owner notification read' })
  @ApiBody({ schema: object({}), required: false })
  @ApiResponse({ status: 200, schema: readResponse })
  read(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    parse(notificationReadSchema, body ?? {});
    return this.inbox.read(
      actor(request),
      parse(medicineIdSchema, id),
      request.requestId,
    );
  }
}
