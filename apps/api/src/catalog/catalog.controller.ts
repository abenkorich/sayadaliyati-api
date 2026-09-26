import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
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
import { Public, requestIp } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
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
    @Inject(RateLimitService) private readonly rates: RateLimitService,
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
      'Literal substring in medicine identity, category, laboratory, country, presentation and MIPH details; exact stored barcode match; case-insensitive text, accents preserved',
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
    name: 'category',
    required: false,
    schema: { type: 'string' },
    description: 'Category UUID, or uncategorized',
  })
  @ApiQuery({
    name: 'laboratory',
    required: false,
    schema: { type: 'string', maxLength: 255 },
    description: 'Exact registration holder name',
  })
  @ApiQuery({
    name: 'holderCountry',
    required: false,
    schema: { type: 'string', maxLength: 255 },
  })
  @ApiQuery({
    name: 'dosageForm',
    required: false,
    schema: { type: 'string', maxLength: 255 },
  })
  @ApiQuery({
    name: 'regulatoryStatus',
    required: false,
    enum: ['CURRENT', 'NOT_RENEWED', 'WITHDRAWN'],
  })
  @ApiQuery({
    name: 'barcode',
    required: false,
    schema: { type: 'string', maxLength: 100 },
    description: 'Exact stored barcode, including leading zeros',
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
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL'],
      default: 'ACTIVE',
    },
  })
  @ApiResponse({ status: 200, schema: medicineListResponse })
  search(@Query() query: unknown) {
    return this.catalog.search(parse(medicineQuerySchema, query));
  }

  @Public()
  @Get('suggestions')
  @ApiOperation({
    summary:
      'Public medicine name suggestions; active catalog only, maximum six results',
    security: [],
  })
  @ApiQuery({
    name: 'q',
    required: true,
    schema: { type: 'string', minLength: 2, maxLength: 200 },
  })
  @ApiQuery({ name: 'category', required: false, schema: { type: 'string' } })
  @ApiQuery({ name: 'laboratory', required: false, schema: { type: 'string' } })
  @ApiQuery({
    name: 'holderCountry',
    required: false,
    schema: { type: 'string' },
  })
  @ApiQuery({ name: 'dosageForm', required: false, schema: { type: 'string' } })
  @ApiResponse({ status: 200, schema: medicineListResponse })
  async suggestions(@Query() query: unknown, @Req() request: AuthRequest) {
    await this.rates.check(
      'catalog-suggestions',
      requestIp(request),
      120,
      60000,
    );
    const input = parse(
      medicineQuerySchema.pick({
        q: true,
        category: true,
        laboratory: true,
        holderCountry: true,
        dosageForm: true,
      }),
      query,
    );
    if (!input.q || input.q.length < 2) throw new ApiError('VALIDATION_ERROR');
    return this.catalog.search({
      ...input,
      page: 1,
      limit: 6,
      status: 'ACTIVE',
    });
  }

  @Get('filters')
  @ApiOperation({
    summary:
      'List laboratory, holder-country and dosage-form filter values across the catalog',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: Object.fromEntries(
            ['laboratories', 'countries', 'dosageForms'].map((key) => [
              key,
              { type: 'array', items: { type: 'string' } },
            ]),
          ),
        },
        meta: { type: 'object' },
      },
    },
  })
  filters() {
    return this.catalog.filters();
  }

  @Get('categories')
  @ApiOperation({ summary: 'List medicine categories' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              slug: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
        meta: { type: 'object' },
      },
    },
  })
  categories() {
    return this.catalog.categories();
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
