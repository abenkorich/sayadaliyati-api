import { AiService, type Usage } from '../admin/ai.service.js';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { API_CONFIG } from '../config.js';
import type { ApiConfig } from '../config.js';
import { ApiError } from '../auth/errors.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import { DatabaseService } from '../database.service.js';
import { validateDocumentImage } from '../documents/images.js';
import type { DocumentImage } from '../documents/images.js';
import { extractWithOpenAI } from './scan-provider.js';
export async function prepareScanImage(file: DocumentImage | undefined) {
  const validated = await validateDocumentImage(file);
  // Re-encode only the submitted crop. Sharp drops EXIF/IPTC/XMP/ICC by default.
  return sharp(validated.bytes, { limitInputPixels: 20000000 })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}
@Injectable()
export class PrescriptionScanService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(RateLimitService) private readonly rate: RateLimitService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}
  async capabilities() {
    const settings = await this.ai.configuration();
    return {
      enabled: !!(
        settings.enabled &&
        settings.keyConfigured &&
        settings.effectiveModel
      ),
      provider: 'OpenAI' as const,
      requiresCroppedImage: true,
    };
  }
  async extract(
    context: AuthContext,
    file: DocumentImage | undefined,
    box = false,
  ) {
    if (context.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
    const settings = await this.ai.configuration();
    if (!(
      settings.enabled &&
      settings.keyConfigured &&
      settings.effectiveModel
    ))
      throw new ApiError('PRESCRIPTION_SCAN_NOT_CONFIGURED');
    await this.rate.check('prescription-scan-minute', context.userId, 2, 60000);
    await this.rate.check(
      'prescription-scan-hour',
      context.userId,
      10,
      3600000,
    );
    const image = await prepareScanImage(file);
    // Audit metadata contains no image, extracted text, filename or provider credential.
    await this.db.client.auditLog.createMany({
      data: [
        {
          actorId: context.userId,
          resourceType: 'PRESCRIPTION_SCAN',
          resourceId: randomUUID(),
          action: 'PRESCRIPTION_SCAN_REQUESTED',
          metadata: {
            provider: 'OpenAI',
            source: box ? 'MEDICINE_BOX' : 'PRESCRIPTION',
            externalProcessingConsent: true,
            medicinesOnlyCropConfirmed: true,
          },
        },
      ],
    });
    const attempt = await this.ai.start(
      box ? 'MEDICINE_BOX' : 'PRESCRIPTION',
      settings.effectiveModel!,
    );
    const started = performance.now();
    const telemetry: { usage?: Usage; httpStatus?: number } = {};
    let preview;
    try {
      preview = await extractWithOpenAI(
        this.config.OPENAI_API_KEY!,
        settings.effectiveModel!,
        image,
        fetch,
        box,
        telemetry,
      );
    } catch (error) {
      await this.ai.finish(
        attempt.id,
        'FAILED',
        performance.now() - started,
        telemetry.usage,
        settings,
        telemetry.httpStatus,
      );
      throw error;
    }
    await this.ai.finish(
      attempt.id,
      'SUCCEEDED',
      performance.now() - started,
      telemetry.usage,
      settings,
    );
    return {
      data: { ...preview, provider: 'OpenAI', requiresReview: true },
      meta: {},
    };
  }
}
