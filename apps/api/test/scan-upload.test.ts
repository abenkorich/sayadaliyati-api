import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { PrescriptionScanController } from '../src/prescriptions/scan.controller.js';
import { PrescriptionScanService } from '../src/prescriptions/scan.service.js';
import { DocumentUploadCapacity } from '../src/documents/documents.controller.js';
import type { DocumentImage } from '../src/documents/images.js';
import type { AuthRequest } from '../src/auth/auth.guard.js';
import { HttpErrorFilter } from '../src/http-error.filter.js';
test('native-style multipart scan reaches extraction on both routes and still rejects extra input', async () => {
  const received: { box: boolean; file: DocumentImage }[] = [];
  const module = await Test.createTestingModule({
    controllers: [PrescriptionScanController],
    providers: [
      DocumentUploadCapacity,
      {
        provide: PrescriptionScanService,
        useValue: {
          extract: async (
            _actor: unknown,
            file: DocumentImage,
            box: boolean,
          ) => {
            received.push({ box, file });
            return {
              data: {
                provider: 'OpenAI',
                requiresReview: true,
                medications: [],
              },
              meta: {},
            };
          },
        },
      },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.use((request: AuthRequest, _response: unknown, next: () => void) => {
    request.auth = { userId: 'patient', sessionId: 'session', role: 'PATIENT' };
    next();
  });
  app.useGlobalFilters(new HttpErrorFilter());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#fff' },
  })
    .jpeg()
    .toBuffer();
  const upload = (fileFirst = true) => {
    const form = new FormData();
    const file = () =>
      form.append(
        'file',
        new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
        'medicines-crop.jpg',
      );
    if (fileFirst) file();
    form.append('externalProcessingConsent', 'true');
    form.append('medicinesOnlyCropConfirmed', 'true');
    if (!fileFirst) file();
    return form;
  };
  try {
    for (const box of [false, true])
      for (const first of [false, true]) {
        const response = await fetch(
          `${base}/me/prescription-scan${box ? '/box' : ''}`,
          { method: 'POST', body: upload(first) },
        );
        assert.equal(
          response.status,
          200,
          JSON.stringify(await response.json()),
        );
        assert.equal(received.at(-1)?.box, box);
        assert.deepEqual(received.at(-1)?.file.buffer, bytes);
      }
    for (const invalid of ['extra', 'duplicate', 'missing', 'second-file']) {
      const form = upload();
      if (invalid === 'extra') form.append('patientName', 'not allowed');
      if (invalid === 'duplicate')
        form.append('externalProcessingConsent', 'true');
      if (invalid === 'missing') form.delete('medicinesOnlyCropConfirmed');
      if (invalid === 'second-file')
        form.append(
          'file',
          new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
          'second.jpg',
        );
      const response = await fetch(`${base}/me/prescription-scan`, {
        method: 'POST',
        body: form,
      });
      assert.equal(response.status, 400);
    }
    assert.equal(received.length, 4);
  } finally {
    await app.close();
  }
});
