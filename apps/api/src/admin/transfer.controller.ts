import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { actor, type AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { AdminTransferService } from './transfer.service.js';
import {
  datasetSchema,
  transferInputSchema,
  exportQuerySchema,
} from './transfer-format.js';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
  return parsed.data;
}
@ApiTags('Administration data transfers')
@ApiBearerAuth()
@ApiParam({ name: 'dataset', enum: datasetSchema.options })
@ApiResponse({ status: 401, description: 'Authentication required.' })
@ApiResponse({
  status: 403,
  description: 'An active administrator is required.',
})
@ApiResponse({
  status: 400,
  description: 'Invalid request, file limits exceeded or export too large.',
})
@ApiResponse({
  status: 409,
  description:
    'Preview expired or target data changed. No import changes committed.',
})
@Controller('admin/transfers')
export class AdminTransferController {
  constructor(
    @Inject(AdminTransferService)
    private readonly transfers: AdminTransferService,
  ) {}
  @Get(':dataset/export')
  @ApiOperation({
    summary: 'Export managed admin fields or download an import template',
    description:
      'Returns a JSON envelope containing filename, content and count. Maximum 50,000 records; use q to narrow the export. Actual data exports are audited.',
  })
  @ApiQuery({ name: 'format', enum: ['json', 'csv'], required: true })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'template', required: false, enum: ['true', 'false'] })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
            count: { type: 'integer' },
          },
        },
        meta: { type: 'object' },
      },
    },
  })
  export(
    @Req() request: AuthRequest,
    @Param('dataset') dataset: string,
    @Query() query: unknown,
  ) {
    const q = parse(exportQuerySchema, query);
    return this.transfers.export(
      actor(request),
      parse(datasetSchema, dataset),
      q.format,
      q.q,
      q.template === 'true',
      request.requestId,
    );
  }
  @Post(':dataset/preview')
  @ApiOperation({
    summary: 'Validate JSON or CSV without changing records',
    description:
      'Maximum 512 KiB UTF-8 and 500 rows (one for settings). Returns valid, issues, counts, first ten row summaries and a signed 15-minute token for a valid preview.',
  })
  @ApiBody({
    schema: z.toJSONSchema(transferInputSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  preview(
    @Req() request: AuthRequest,
    @Param('dataset') dataset: string,
    @Body() body: unknown,
  ) {
    return this.transfers.preview(
      actor(request),
      parse(datasetSchema, dataset),
      parse(transferInputSchema, body),
    );
  }
  @Post(':dataset/apply')
  @ApiOperation({
    summary: 'Atomically apply a reviewed import',
    description:
      'Send the exact original format/content plus the preview token. Revalidates target state, audits changes and retains a receipt so repeated confirmations of the same token cannot create duplicate rows. Returns applied and alreadyApplied.',
  })
  @ApiBody({
    schema: z.toJSONSchema(transferInputSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  apply(
    @Req() request: AuthRequest,
    @Param('dataset') dataset: string,
    @Body() body: unknown,
  ) {
    return this.transfers.apply(
      actor(request),
      parse(datasetSchema, dataset),
      parse(transferInputSchema, body),
      request.requestId,
    );
  }
}
