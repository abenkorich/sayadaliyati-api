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
  DirectoryService,
  directoryKind,
  directoryQuery,
} from './directory.service.js';
import { ApiError } from '../auth/errors.js';
import { errorResponse } from '../auth/openapi.js';

@ApiTags('Healthcare directory')
@ApiBearerAuth()
@Controller('directory')
export class DirectoryController {
  constructor(
    @Inject(DirectoryService) private readonly directory: DirectoryService,
  ) {}
  @Get(':kind')
  @ApiQuery({
    name: 'countryId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'wilayaId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'communeId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOperation({
    summary:
      'List active hospitals, pharmacies or doctors for authenticated portal users',
  })
  @ApiParam({ name: 'kind', enum: ['hospitals', 'pharmacies', 'doctors'] })
  @ApiQuery({
    name: 'q',
    required: false,
    schema: { type: 'string', maxLength: 100 },
    description:
      'Literal case-insensitive search in name, specialty, address and city',
  })
  @ApiQuery({
    name: 'city',
    required: false,
    schema: { type: 'string', maxLength: 100 },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'id',
              'kind',
              'name',
              'specialty',
              'address',
              'city',
              'phone',
              'email',
            ],
            properties: {
              id: { type: 'string', format: 'uuid' },
              kind: {
                type: 'string',
                enum: ['hospitals', 'pharmacies', 'doctors'],
              },
              name: { type: 'string' },
              ...Object.fromEntries(
                ['specialty', 'address', 'city', 'phone', 'email'].map(
                  (key) => [key, { type: 'string' as const, nullable: true }],
                ),
              ),
            },
          },
        },
        meta: {
          type: 'object',
          required: ['page', 'limit', 'total', 'totalPages'],
          properties: Object.fromEntries(
            ['page', 'limit', 'total', 'totalPages'].map((key) => [
              key,
              { type: 'integer' as const },
            ]),
          ),
        },
      },
    },
  })
  @ApiResponse({ status: 400, schema: errorResponse })
  @ApiResponse({ status: 401, schema: errorResponse })
  @ApiResponse({ status: 429, schema: errorResponse })
  list(@Param('kind') kind: string, @Query() query: unknown) {
    const parsedKind = directoryKind.safeParse(kind),
      parsedQuery = directoryQuery.safeParse(query);
    if (!parsedKind.success || !parsedQuery.success)
      throw new ApiError('VALIDATION_ERROR');
    return this.directory.list(parsedKind.data, parsedQuery.data);
  }
}
