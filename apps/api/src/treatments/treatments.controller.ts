import {
  treatmentResponse,
  treatmentListResponse,
  medicationEventResponse,
  medicationEventListResponse,
} from './openapi.js';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
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
  treatmentCreateSchema,
  treatmentStateSchema,
  treatmentQuerySchema,
  medicationEventCreateSchema,
  medicationEventQuerySchema,
  medicineIdSchema,
} from '@saydaliyati/validation';
import { actor } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { errorResponse } from '../auth/openapi.js';
import { TreatmentsService } from './treatments.service.js';
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('VALIDATION_ERROR');
  return result.data;
};
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
@ApiTags('Treatments')
@ApiBearerAuth()
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 404, schema: errorResponse })
@ApiResponse({ status: 409, schema: errorResponse })
@ApiResponse({ status: 429, schema: errorResponse })
@Controller('me/treatments')
export class TreatmentsController {
  constructor(
    @Inject(TreatmentsService) private readonly treatments: TreatmentsService,
  ) {}
  @Get()
  @ApiResponse({ status: 200, schema: treatmentListResponse })
  @ApiOperation({ summary: 'List own treatments' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  })
  list(@Query() query: unknown, @Req() request: AuthRequest) {
    return this.treatments.list(
      actor(request),
      parse(treatmentQuerySchema, query),
    );
  }
  @Post()
  @ApiBody({ schema: schema(treatmentCreateSchema) })
  @ApiResponse({ status: 201, schema: treatmentResponse })
  @ApiOperation({
    summary:
      'Save explicit bounded fixed-time treatment as PLANNED; no automatic activation',
  })
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.treatments.create(
      actor(request),
      parse(treatmentCreateSchema, body),
      request.requestId,
    );
  }
  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: treatmentResponse })
  @ApiOperation({
    summary:
      'Read immutable schedule snapshots, stable occurrences and factual event counts',
  })
  detail(@Param('id') id: string, @Req() request: AuthRequest) {
    return this.treatments.detail(actor(request), parse(medicineIdSchema, id));
  }
  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(treatmentStateSchema) })
  @ApiResponse({ status: 200, schema: treatmentResponse })
  @ApiOperation({
    summary:
      'Explicitly activate, complete or cancel; schedule/history edits and pause/resume unavailable',
  })
  state(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.treatments.state(
      actor(request),
      parse(medicineIdSchema, id),
      parse(treatmentStateSchema, body).status,
      request.requestId,
    );
  }
}
@ApiTags('Medication events')
@ApiBearerAuth()
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 404, schema: errorResponse })
@ApiResponse({ status: 409, schema: errorResponse })
@Controller('me/medication-events')
export class MedicationEventsController {
  constructor(
    @Inject(TreatmentsService) private readonly treatments: TreatmentsService,
  ) {}
  @Get()
  @ApiResponse({ status: 200, schema: medicationEventListResponse })
  @ApiOperation({
    summary:
      'List own dose records; bounded pagination and explicit UTC range filters',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'treatmentId', required: false, type: String })
  @ApiQuery({ name: 'treatmentMedicationId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['TAKEN', 'SKIPPED'] })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  list(@Query() query: unknown, @Req() request: AuthRequest) {
    return this.treatments.events(
      actor(request),
      parse(medicationEventQuerySchema, query),
    );
  }
  @Post()
  @ApiBody({ schema: schema(medicationEventCreateSchema) })
  @ApiResponse({ status: 201, schema: medicationEventResponse })
  @ApiOperation({
    summary:
      'Record TAKEN/SKIPPED for a due owner occurrence; identical retries return the original event',
  })
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.treatments.event(
      actor(request),
      parse(medicationEventCreateSchema, body),
      request.requestId,
    );
  }
}
