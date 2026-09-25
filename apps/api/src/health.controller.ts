import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database.service.js';
import { Public } from './auth/auth.guard.js';
import { RateLimitService } from './auth/rate-limit.service.js';

const successSchema = (status: string) => ({
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', enum: [status] } },
    },
    meta: { type: 'object', additionalProperties: false },
  },
});

@ApiTags('Operations')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RateLimitService) private readonly rates: RateLimitService,
  ) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Process liveness; independent of PostgreSQL' })
  @ApiResponse({ status: 200, schema: successSchema('ok') })
  live() {
    return { data: { status: 'ok' }, meta: {} };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Required PostgreSQL application tables and Redis readiness',
  })
  @ApiResponse({ status: 200, schema: successSchema('ready') })
  @ApiResponse({
    status: 503,
    description: 'Database/schema or Redis unavailable',
    schema: {
      type: 'object',
      required: ['error'],
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message', 'details'],
          properties: {
            code: { type: 'string', enum: ['SERVICE_UNAVAILABLE'] },
            message: { type: 'string' },
            details: { type: 'object', additionalProperties: false },
          },
        },
      },
    },
  })
  async ready() {
    if (!(await this.database.isReady()) || !(await this.rates.isReady()))
      throw new ServiceUnavailableException();
    return { data: { status: 'ready' }, meta: {} };
  }
}
