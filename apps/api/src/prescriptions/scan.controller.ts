import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger';
import { scanResultSchema, boxResultSchema } from './scan-schema.js';
import { actor } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { DocumentUploadCapacity } from '../documents/documents.controller.js';
import { MAX_DOCUMENT_BYTES } from '../documents/images.js';
import type { DocumentImage } from '../documents/images.js';
import { PrescriptionScanService } from './scan.service.js';
@ApiTags('Prescription extraction preview')
@ApiBearerAuth()
@Controller('me/prescription-scan')
export class PrescriptionScanController {
  constructor(
    @Inject(PrescriptionScanService)
    private readonly scan: PrescriptionScanService,
  ) {}
  @Get('capabilities')
  @ApiOperation({
    summary: 'Whether AI extraction is configured; exposes no credentials',
  })
  capabilities(@Req() request: AuthRequest) {
    if (actor(request).role !== 'PATIENT') throw new ApiError('FORBIDDEN');
    return { data: this.scan.capabilities(), meta: {} };
  }
  @Post(['', 'box'])
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Extract an unconfirmed preview from one image; creates no prescription, document or treatment',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'file',
        'externalProcessingConsent',
        'medicinesOnlyCropConfirmed',
      ],
      properties: {
        file: { type: 'string', format: 'binary' },
        externalProcessingConsent: { type: 'string', enum: ['true'] },
        medicinesOnlyCropConfirmed: { type: 'string', enum: ['true'] },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Unconfirmed, bounded transcription suggestions; requires human review',
    schema: z.toJSONSchema(
      z.object({
        data: scanResultSchema.extend({
          provider: z.literal('OpenAI'),
          requiresReview: z.literal(true),
          packageInfo: boxResultSchema
            .pick({ quantity: true, unit: true, expiryDate: true })
            .optional(),
        }),
        meta: z.object({}).strict(),
      }),
      { target: 'openapi-3.0' },
    ) as SchemaObject,
  })
  @UseInterceptors(
    DocumentUploadCapacity,
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_DOCUMENT_BYTES,
        files: 1,
        fields: 2,
        parts: 3,
        fieldSize: 8,
        fieldNameSize: 32,
      },
    }),
  )
  extract(
    @Req() request: AuthRequest & { url?: string },
    @Body() body: unknown,
    @UploadedFile() file: DocumentImage | undefined,
  ) {
    if (
      !z
        .object({
          externalProcessingConsent: z.literal('true'),
          medicinesOnlyCropConfirmed: z.literal('true'),
        })
        .strict()
        .safeParse(body).success
    )
      throw new ApiError('VALIDATION_ERROR');
    return this.scan.extract(
      actor(request),
      file,
      request.url?.split('?')[0]?.endsWith('/box') === true,
    );
  }
}
