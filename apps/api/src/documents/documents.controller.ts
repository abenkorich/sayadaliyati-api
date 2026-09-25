import {
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { defer, finalize } from 'rxjs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { medicineIdSchema } from '@saydaliyati/validation';
import { actor } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { errorResponse } from '../auth/openapi.js';
import { DocumentsService } from './documents.service.js';
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES } from './images.js';
import type { DocumentImage } from './images.js';
import { Inject } from '@nestjs/common';
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('VALIDATION_ERROR');
  return result.data;
};
const uploadBody = z
  .object({
    pageNumber: z
      .string()
      .regex(/^[1-9][0-9]?$/)
      .transform(Number)
      .pipe(z.number().int().max(MAX_DOCUMENT_PAGES)),
  })
  .strict();
// Nest runs guards first. Reserve bounded memory before multipart buffering.
@Injectable()
export class DocumentUploadCapacity implements NestInterceptor {
  private active = 0;
  intercept(context: ExecutionContext, next: CallHandler) {
    if (
      actor(context.switchToHttp().getRequest<AuthRequest>()).role !== 'PATIENT'
    )
      throw new ApiError('FORBIDDEN');
    if (this.active >= 2) throw new ApiError('SERVICE_UNAVAILABLE');
    this.active++;
    return defer(() => next.handle()).pipe(
      finalize(() => {
        this.active--;
      }),
    );
  }
}
@ApiTags('Private prescription documents')
@ApiBearerAuth()
@ApiResponse({ status: 400, schema: errorResponse })
@ApiResponse({ status: 401, schema: errorResponse })
@ApiResponse({ status: 403, schema: errorResponse })
@ApiResponse({ status: 404, schema: errorResponse })
@ApiResponse({ status: 409, schema: errorResponse })
@ApiResponse({ status: 413, schema: errorResponse })
@ApiResponse({ status: 415, schema: errorResponse })
@ApiResponse({ status: 429, schema: errorResponse })
@ApiResponse({ status: 503, schema: errorResponse })
@ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
@Controller('me/prescriptions/:id/documents')
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}
  @Post()
  @ApiOperation({
    summary:
      'Append one original JPEG/PNG page to an owner DRAFT; UPLOADED only, no OCR job',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['pageNumber', 'file'],
      properties: {
        pageNumber: {
          type: 'string',
          description:
            'Next consecutive page number, starting at 1; maximum 20',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG/PNG, maximum 5 MiB and 20 million pixels',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'object',
          required: ['id', 'pageNumber', 'mimeType', 'processingStatus'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            pageNumber: { type: 'integer', minimum: 1, maximum: 20 },
            mimeType: { type: 'string', enum: ['image/jpeg', 'image/png'] },
            processingStatus: { type: 'string', enum: ['UPLOADED'] },
          },
        },
        meta: { type: 'object', additionalProperties: false },
      },
    },
  })
  @UseInterceptors(
    DocumentUploadCapacity,
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_DOCUMENT_BYTES,
        files: 1,
        fields: 1,
        parts: 2,
        fieldSize: 8,
        fieldNameSize: 32,
      },
    }),
  )
  upload(
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFile() file: DocumentImage | undefined,
    @Req() request: AuthRequest,
  ) {
    return this.documents.upload(
      actor(request),
      parse(medicineIdSchema, id),
      parse(uploadBody, body).pageNumber,
      file,
      request.requestId,
    );
  }
  @Get(':documentId/download')
  @ApiParam({ name: 'documentId', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary:
      'Audit and issue an owner-only private download link valid for at most 60 seconds',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'object',
          required: ['url', 'expiresAt'],
          properties: {
            url: { type: 'string', format: 'uri' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
        meta: { type: 'object', additionalProperties: false },
      },
    },
  })
  download(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() request: AuthRequest,
  ) {
    return this.documents.download(
      actor(request),
      parse(medicineIdSchema, id),
      parse(medicineIdSchema, documentId),
      request.requestId,
    );
  }
}
