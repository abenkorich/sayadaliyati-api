import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import { actor, type AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { AiService } from './ai.service.js';
import { aiQuerySchema, aiSettingsSchema } from './ai.schemas.js';
@ApiTags('Administration AI')
@ApiBearerAuth()
@Controller('admin/ai')
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}
  @Get('settings') settings(@Req() r: AuthRequest) {
    return this.ai.settings(actor(r));
  }
  @Patch('settings')
  @ApiBody({
    schema: z.toJSONSchema(aiSettingsSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  save(@Req() r: AuthRequest, @Body() body: unknown) {
    const parsed = aiSettingsSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
    return this.ai.save(actor(r), parsed.data, r.requestId);
  }
  @Post('verify')
  @ApiOperation({
    summary:
      'Check credential and model access without inference; does not verify billing balance or extraction compatibility',
  })
  @HttpCode(200)
  verify(@Req() r: AuthRequest) {
    return this.ai.verify(actor(r), r.requestId);
  }
  @Get('usage')
  @ApiQuery({ name: 'days', required: false, enum: ['7', '30', '90'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({
    name: 'feature',
    required: false,
    enum: ['PRESCRIPTION', 'MEDICINE_BOX'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['STARTED', 'SUCCEEDED', 'FAILED'],
  })
  usage(@Req() r: AuthRequest, @Query() query: unknown) {
    const parsed = aiQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
    return this.ai.dashboard(actor(r), parsed.data);
  }
}
