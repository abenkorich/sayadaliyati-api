import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { DocumentStorage } from './storage.service.js';
import { MAX_DOCUMENT_PAGES, validateDocumentImage } from './images.js';
import type { DocumentImage } from './images.js';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DocumentStorage) private readonly storage: DocumentStorage,
  ) {}
  private async parent(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
  ) {
    await this.auth.authorizePatientMutation(tx, actor);
    const rows = await tx.$queryRaw<
      { status: string }[]
    >`SELECT status FROM prescriptions WHERE id = ${id}::uuid AND patient_id = ${actor.userId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new ApiError('RESOURCE_NOT_FOUND');
    return rows[0];
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actor: AuthContext,
    id: string,
    action: string,
    requestId: string,
  ) {
    await tx.auditLog.createMany({
      data: [
        {
          actorId: actor.userId,
          resourceType: 'PRESCRIPTION_DOCUMENT',
          resourceId: id,
          action,
          metadata: { requestId, result: 'SUCCESS' },
        },
      ],
    });
  }
  async upload(
    actor: AuthContext,
    prescriptionId: string,
    pageNumber: number,
    file: DocumentImage | undefined,
    requestId: string,
  ) {
    // Cheap ownership check precedes decoding and object-store work; rechecked under lock.
    if (actor.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
    const parent = await this.db.client.prescription.findFirst({
      where: { id: prescriptionId, patientId: actor.userId },
      select: { status: true },
    });
    if (!parent) throw new ApiError('RESOURCE_NOT_FOUND');
    if (parent.status !== 'DRAFT') throw new ApiError('DOCUMENT_CONFLICT');
    this.storage.requireConfigured();
    const image = await validateDocumentImage(file);
    const id = randomUUID(),
      key = `prescriptions/${randomUUID()}/${id}`;
    let attempted = false;
    try {
      return await this.db.client.$transaction(
        async (tx) => {
          const current = await this.parent(tx, actor, prescriptionId);
          if (current.status !== 'DRAFT')
            throw new ApiError('DOCUMENT_CONFLICT');
          const last = await tx.prescriptionDocument.aggregate({
            where: { prescriptionId },
            _max: { pageNumber: true },
          });
          const next = (last._max.pageNumber ?? 0) + 1;
          if (pageNumber !== next || pageNumber > MAX_DOCUMENT_PAGES)
            throw new ApiError('DOCUMENT_CONFLICT');
          attempted = true;
          await this.storage.put(key, image.bytes, image.mimeType);
          await tx.$executeRaw`INSERT INTO prescription_documents (id, prescription_id, patient_id, page_number, storage_key, mime_type, processing_status) VALUES (${id}::uuid, ${prescriptionId}::uuid, ${actor.userId}::uuid, ${pageNumber}, ${key}, ${image.mimeType}, 'UPLOADED')`;
          await this.audit(tx, actor, id, 'DOCUMENT_UPLOADED', requestId);
          return {
            data: {
              id,
              pageNumber,
              mimeType: image.mimeType,
              processingStatus: 'UPLOADED',
            },
            meta: {},
          };
        },
        { timeout: 20000 },
      );
    } catch (error) {
      if (attempted) {
        try {
          // Wait for the original transaction's parent lock before checking an
          // ambiguous COMMIT result. Never delete bytes belonging to a committed row.
          await this.db.client.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT id FROM prescriptions WHERE id = ${prescriptionId}::uuid AND patient_id = ${actor.userId}::uuid FOR UPDATE`;
              const committed = await tx.prescriptionDocument.findUnique({
                where: { id },
                select: { id: true },
              });
              if (!committed) await this.storage.remove(key);
            },
            { timeout: 20000 },
          );
        } catch {
          // No URL/key/credentials in logs. A crash or cleanup failure leaves a private orphan.
          this.logger.warn('Document upload cleanup requires reconciliation.');
        }
      }
      throw error;
    }
  }
  async download(
    actor: AuthContext,
    prescriptionId: string,
    documentId: string,
    requestId: string,
  ) {
    if (actor.role !== 'PATIENT') throw new ApiError('FORBIDDEN');
    return this.db.client.$transaction(
      async (tx) => {
        await this.parent(tx, actor, prescriptionId);
        const rows = await tx.$queryRaw<
          {
            storageKey: string;
            mimeType: string;
            retentionUntil: Date | null;
          }[]
        >`SELECT storage_key AS "storageKey", mime_type AS "mimeType", retention_until AS "retentionUntil" FROM prescription_documents WHERE id = ${documentId}::uuid AND prescription_id = ${prescriptionId}::uuid AND patient_id = ${actor.userId}::uuid AND deleted_at IS NULL AND (retention_until IS NULL OR retention_until > now())`;
        const row = rows[0];
        if (!row) throw new ApiError('RESOURCE_NOT_FOUND');
        const data = await this.storage.download(
          row.storageKey,
          documentId,
          row.mimeType,
          row.retentionUntil,
        );
        await this.audit(
          tx,
          actor,
          documentId,
          'DOCUMENT_DOWNLOAD_ISSUED',
          requestId,
        );
        return { data, meta: {} };
      },
      { timeout: 20000 },
    );
  }
}
