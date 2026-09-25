import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { API_CONFIG } from '../config.js';
import type { ApiConfig } from '../config.js';
import { ApiError } from '../auth/errors.js';

export const DOWNLOAD_TTL_SECONDS = 60;
@Injectable()
export class DocumentStorage implements OnModuleDestroy {
  private readonly client: S3Client | undefined;
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {
    if (config.DOCUMENT_STORAGE_ENDPOINT) {
      this.client = new S3Client({
        endpoint: config.DOCUMENT_STORAGE_ENDPOINT,
        region: config.DOCUMENT_STORAGE_REGION,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.DOCUMENT_STORAGE_ACCESS_KEY!,
          secretAccessKey: config.DOCUMENT_STORAGE_SECRET_KEY!,
        },
        maxAttempts: 1,
        requestHandler: { connectionTimeout: 2000, requestTimeout: 10000 },
      });
    }
  }
  requireConfigured() {
    if (!this.client) throw new ApiError('SERVICE_UNAVAILABLE');
    return this.client;
  }
  async put(key: string, bytes: Buffer, mimeType: string) {
    const client = this.requireConfigured();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: this.config.DOCUMENT_STORAGE_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
          CacheControl: 'no-store',
          ContentDisposition: 'attachment',
          IfNoneMatch: '*',
        }),
      );
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
  }
  async remove(key: string) {
    await this.requireConfigured().send(
      new DeleteObjectCommand({
        Bucket: this.config.DOCUMENT_STORAGE_BUCKET,
        Key: key,
      }),
    );
  }
  async download(
    key: string,
    documentId: string,
    mimeType: string,
    retentionUntil: Date | null = null,
  ) {
    const client = this.requireConfigured();
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: this.config.DOCUMENT_STORAGE_BUCKET,
          Key: key,
        }),
      );
      const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000);
      const expiresIn = retentionUntil
        ? Math.min(
            DOWNLOAD_TTL_SECONDS,
            Math.floor(
              (retentionUntil.getTime() - signingDate.getTime()) / 1000,
            ),
          )
        : DOWNLOAD_TTL_SECONDS;
      if (expiresIn < 1) throw new ApiError('RESOURCE_NOT_FOUND');
      if (!['image/png', 'image/jpeg'].includes(mimeType))
        throw new ApiError('SERVICE_UNAVAILABLE');
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: this.config.DOCUMENT_STORAGE_BUCKET,
          Key: key,
          ResponseContentType: mimeType,
          ResponseContentDisposition: `attachment; filename="prescription-${documentId}.${mimeType === 'image/png' ? 'png' : 'jpg'}"`,
          ResponseCacheControl: 'no-store',
        }),
        { expiresIn, signingDate },
      );
      return {
        url,
        expiresAt: new Date(
          signingDate.getTime() + expiresIn * 1000,
        ).toISOString(),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
  }
  onModuleDestroy() {
    this.client?.destroy();
  }
}
