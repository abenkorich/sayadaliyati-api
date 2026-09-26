import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import { actor, type AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
const inputSchema = z.object({ processingConsent: z.boolean() }).strict();
@ApiTags('Scan preferences')
@ApiBearerAuth()
@Controller('me/scan-preferences')
export class ScanPreferencesController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @ApiOperation({ summary: 'Read own saved scan processing permission' })
  async get(@Req() request: AuthRequest) {
    const user = actor(request);
    if (user.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
    const rows = await this.db.client.$queryRaw<{ consent: boolean | null }[]>`
      SELECT scan_processing_consent AS consent FROM patient_profiles WHERE user_id = ${user.userId}::uuid`;
    if (!rows[0]) throw new ApiError('SERVICE_UNAVAILABLE');
    return {
      data: {
        configured: rows[0].consent !== null,
        processingConsent: rows[0].consent === true,
      },
      meta: {},
    };
  }
  @Patch()
  @ApiOperation({ summary: 'Save or revoke own scan processing permission' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['processingConsent'],
      properties: { processingConsent: { type: 'boolean' } },
    },
  })
  async patch(@Body() body: unknown, @Req() request: AuthRequest) {
    const user = actor(request);
    if (user.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
    const consent = parsed.data.processingConsent;
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizeOwnerMutation(tx, user);
      const count =
        await tx.$executeRaw`UPDATE patient_profiles SET scan_processing_consent = ${consent}, updated_at = now() WHERE user_id = ${user.userId}::uuid`;
      if (count !== 1) throw new ApiError('SERVICE_UNAVAILABLE');
      await tx.auditLog.createMany({
        data: [
          {
            actorId: user.userId,
            resourceId: user.userId,
            resourceType: 'PATIENT_PROFILE',
            action: 'SCAN_PREFERENCES_UPDATED',
            metadata: {
              requestId: request.requestId,
              processingConsent: consent,
            },
          },
        ],
      });
      return {
        data: { configured: true, processingConsent: consent },
        meta: {},
      };
    });
  }
}
