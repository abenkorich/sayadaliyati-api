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
  inventoryCreateSchema,
  inventoryIdSchema,
  inventoryPatchSchema,
  inventoryQuerySchema,
} from '@saydaliyati/validation';
import type { z } from 'zod';
import { actor } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { emptyResponse, errorResponse } from '../auth/openapi.js';
import { InventoryService } from './inventory.service.js';
import {
  createBody,
  inventoryListResponse,
  inventoryResponse,
  patchBody,
} from './openapi.js';
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError('VALIDATION_ERROR');
  return result.data;
};

@ApiTags('Patient inventory')
@ApiBearerAuth()
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 404, schema: errorResponse })
@ApiResponse({ status: 429, schema: errorResponse })
@ApiResponse({ status: 503, schema: errorResponse })
@Controller('me/inventory')
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'List only the authenticated patient’s unarchived inventory; filters intersect',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 200 },
    description:
      'Literal case-insensitive medicine name, brand, generic name or batch substring',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: ['ACTIVE'], default: 'ACTIVE' },
    description: 'Unarchived inventory; never a clinical or medicine status',
  })
  @ApiQuery({
    name: 'expiryBefore',
    required: false,
    schema: { type: 'string', format: 'date' },
    description:
      'Strictly before this calendar date; unknown expiry is excluded',
  })
  @ApiQuery({
    name: 'lowStock',
    required: false,
    schema: { type: 'string', enum: ['true', 'false'] },
    description:
      'Threshold must be set for true; false includes records without a threshold',
  })
  @ApiQuery({
    name: 'medicineId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
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
    name: 'sort',
    required: false,
    schema: {
      type: 'string',
      enum: ['expiry_asc', 'name_asc', 'created_desc'],
      default: 'created_desc',
    },
  })
  @ApiResponse({ status: 200, schema: inventoryListResponse })
  list(@Query() query: unknown, @Req() request: AuthRequest) {
    return this.inventory.list(
      actor(request),
      parse(inventoryQuerySchema, query),
    );
  }
  @Post()
  @ApiOperation({
    summary:
      'Create a separate patient-owned batch; quantity/unit are explicit, POST retries can create another row',
  })
  @ApiBody({ schema: createBody })
  @ApiResponse({ status: 201, schema: inventoryResponse })
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.inventory.create(
      actor(request),
      parse(inventoryCreateSchema, body),
      request.requestId,
    );
  }
  @Get(':id')
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary:
      'Read an unarchived owner record; wrong-owner and archived IDs return 404',
  })
  @ApiResponse({ status: 200, schema: inventoryResponse })
  detail(@Param('id') id: string, @Req() request: AuthRequest) {
    return this.inventory.detail(actor(request), parse(inventoryIdSchema, id));
  }
  @Patch(':id')
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary:
      'Edit an owner record; changing unit requires explicit quantity and lowStockThreshold (or null)',
  })
  @ApiBody({ schema: patchBody })
  @ApiResponse({ status: 200, schema: inventoryResponse })
  patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.inventory.patch(
      actor(request),
      parse(inventoryIdSchema, id),
      parse(inventoryPatchSchema, body),
      request.requestId,
    );
  }
  @Delete(':id')
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary:
      'Idempotently archive an owner record with transactional audit; never delete it',
  })
  @ApiResponse({ status: 200, schema: emptyResponse })
  archive(@Param('id') id: string, @Req() request: AuthRequest) {
    return this.inventory.archive(
      actor(request),
      parse(inventoryIdSchema, id),
      request.requestId,
    );
  }
}
