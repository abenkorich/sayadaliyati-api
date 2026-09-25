import {
  Body,
  Controller,
  Delete,
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
import {
  medicineIdSchema,
  prescriptionCreateSchema,
  prescriptionQuerySchema,
  prescriptionReviewSchema,
} from '@saydaliyati/validation';
import type { z } from 'zod';
import { actor } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { emptyResponse, errorResponse } from '../auth/openapi.js';
import { PrescriptionsService } from './prescriptions.service.js';
import {
  prescriptionCreateBody,
  prescriptionListResponse,
  prescriptionResponse,
  prescriptionReviewBody,
} from './openapi.js';
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError('VALIDATION_ERROR');
  return result.data;
};
@ApiTags('Patient prescription drafts')
@ApiBearerAuth()
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 404, schema: errorResponse })
@ApiResponse({
  status: 409,
  schema: errorResponse,
  description: 'Stale review ID, rejected line or non-editable prescription',
})
@ApiResponse({ status: 429, schema: errorResponse })
@ApiResponse({ status: 503, schema: errorResponse })
@Controller('me/prescriptions')
export class PrescriptionsController {
  constructor(
    @Inject(PrescriptionsService)
    private readonly prescriptions: PrescriptionsService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'List owner prescriptions; archives excluded unless explicitly requested',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: ['DRAFT', 'CONFIRMED', 'ARCHIVED'] },
  })
  @ApiResponse({ status: 200, schema: prescriptionListResponse })
  list(@Query() query: unknown, @Req() request: AuthRequest) {
    return this.prescriptions.list(
      actor(request),
      parse(prescriptionQuerySchema, query),
    );
  }
  @Post()
  @ApiOperation({
    summary:
      'Save a manual DRAFT with USER field provenance and no OCR job; verified doctor linking is not available',
  })
  @ApiBody({ schema: prescriptionCreateBody })
  @ApiResponse({ status: 201, schema: prescriptionResponse })
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.prescriptions.create(
      actor(request),
      parse(prescriptionCreateSchema, body),
      request.requestId,
    );
  }
  @Get(':id')
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary:
      'Read owner details and latest field revisions; no storage keys or document URLs',
  })
  @ApiResponse({ status: 200, schema: prescriptionResponse })
  detail(@Param('id') id: string, @Req() request: AuthRequest) {
    return this.prescriptions.detail(
      actor(request),
      parse(medicineIdSchema, id),
    );
  }
  @Patch(':id')
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary:
      'Append manual field revisions, reject lines, explicitly confirm a current complete review snapshot, or archive',
  })
  @ApiBody({ schema: prescriptionReviewBody })
  @ApiResponse({ status: 200, schema: prescriptionResponse })
  review(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.prescriptions.review(
      actor(request),
      parse(medicineIdSchema, id),
      parse(prescriptionReviewSchema, body),
      request.requestId,
    );
  }
  @Delete(':id')
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary:
      'Idempotently archive the owner prescription, preserving fields, documents and audit',
  })
  @ApiResponse({ status: 200, schema: emptyResponse })
  archive(@Param('id') id: string, @Req() request: AuthRequest) {
    return this.prescriptions.archive(
      actor(request),
      parse(medicineIdSchema, id),
      request.requestId,
    );
  }
}
