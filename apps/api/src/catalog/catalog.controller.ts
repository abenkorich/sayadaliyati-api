import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  barcodeSchema,
  medicineIdSchema,
  medicineQuerySchema,
} from '@saydaliyati/validation';
import type { z } from 'zod';
import { ApiError } from '../auth/errors.js';
import { errorResponse } from '../auth/openapi.js';
import { CatalogService } from './catalog.service.js';
import { medicineDetailResponse, medicineListResponse } from './openapi.js';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
  return parsed.data;
};
@ApiTags('Medicine catalog')
@ApiBearerAuth()
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 404, schema: errorResponse })
@ApiResponse({ status: 429, schema: errorResponse })
@ApiResponse({ status: 503, schema: errorResponse })
@Controller('medicines')
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'Search catalog identities; defaults to ACTIVE records, ordered by normalized name and ID',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 200 },
    description:
      'Literal substring in name, brand, generic name or ingredient; case-insensitive, accents preserved',
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
    name: 'ingredient',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'manufacturer',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: {
      type: 'string',
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
    },
  })
  @ApiResponse({ status: 200, schema: medicineListResponse })
  search(@Query() query: unknown) {
    return this.catalog.search(parse(medicineQuerySchema, query));
  }

  @Get('barcode/:barcode')
  @ApiOperation({
    summary:
      'Look up exact stored barcode text; no QR interpretation, network fetch or automatic inventory addition',
  })
  @ApiParam({
    name: 'barcode',
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  })
  @ApiResponse({ status: 200, schema: medicineDetailResponse })
  barcode(@Param('barcode') barcode: string) {
    return this.catalog.barcode(parse(barcodeSchema, barcode));
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Read canonical medicine identity, including explicit status and provenance',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, schema: medicineDetailResponse })
  detail(@Param('id') id: string) {
    return this.catalog.detail(parse(medicineIdSchema, id));
  }
}
