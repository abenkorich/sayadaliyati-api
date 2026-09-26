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
  ApiTags,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger';
const bodySchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
import { actor, type AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { GeoService } from './geo.service.js';
import { geoKind, geoQuery, geoRecord, geoImport } from './geo.schemas.js';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw new ApiError('VALIDATION_ERROR');
  return p.data;
}
@ApiTags('Geography')
@ApiBearerAuth()
@ApiParam({ name: 'kind', enum: ['countries', 'wilayas', 'communes'] })
@Controller()
export class GeoController {
  constructor(@Inject(GeoService) private geo: GeoService) {}
  @Get('geography/:kind')
  @ApiQuery({
    name: 'parentId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  list(@Param('kind') kind: string, @Query() query: unknown) {
    const q = parse(geoQuery, query);
    return this.geo.list(parse(geoKind, kind), q.parentId);
  }
  @Post('admin/geography/:kind')
  @ApiBody({ schema: bodySchema(geoRecord) })
  create(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ) {
    return this.geo.save(
      actor(r),
      parse(geoKind, kind),
      undefined,
      parse(geoRecord, body),
      r.requestId,
    );
  }
  @Patch('admin/geography/:kind/:id')
  @ApiBody({ schema: bodySchema(geoRecord) })
  save(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.geo.save(
      actor(r),
      parse(geoKind, kind),
      parse(z.string().uuid(), id),
      parse(geoRecord, body),
      r.requestId,
    );
  }
  @Post('admin/geography/:kind/:operation')
  @ApiParam({ name: 'operation', enum: ['preview', 'apply'] })
  @ApiBody({ schema: bodySchema(geoImport) })
  import(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Param('operation') operation: string,
    @Body() body: unknown,
  ) {
    return this.geo.import(
      actor(r),
      parse(geoKind, kind),
      parse(geoImport, body),
      parse(z.enum(['preview', 'apply']), operation) === 'apply',
      r.requestId,
    );
  }
}
