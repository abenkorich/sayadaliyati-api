import type { AiService } from '../src/admin/ai.service.js';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { extractWithOpenAI } from '../src/prescriptions/scan-provider.js';
import {
  prepareScanImage,
  PrescriptionScanService,
} from '../src/prescriptions/scan.service.js';
import { PrescriptionScanController } from '../src/prescriptions/scan.controller.js';
import { scanResultSchema } from '../src/prescriptions/scan-schema.js';
import { readConfig } from '../src/config.js';
import type { DatabaseService } from '../src/database.service.js';
import type { RateLimitService } from '../src/auth/rate-limit.service.js';
const preview = {
  prescriptionDate: null,
  validUntil: null,
  medications: [
    {
      extractedName: 'SYNTHETIC',
      strength: '500 mg',
      dosage: null,
      dosageUnit: null,
      frequency: null,
      frequencyUnit: null,
      duration: null,
      durationUnit: null,
      quantity: null,
      instructions: null,
      scheduledTimes: null,
      startDate: null,
      endDate: null,
    },
  ],
  warnings: ['Unclear dose; left unknown.'],
};
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(value) }],
        },
      ],
    }),
  );
test('provider receives only the scrubbed crop, strict schema, no storage and no patient identity', async () => {
  let calls = 0;
  const crop = Buffer.from('synthetic-cropped-bytes');
  const result = await extractWithOpenAI(
    'synthetic-key',
    'test-model',
    crop,
    async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init?.redirect, 'error');
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.store, false);
      assert.equal(payload.text.format.strict, true);
      assert.equal(
        payload.input[0].content[1].image_url,
        `data:image/jpeg;base64,${crop.toString('base64')}`,
      );
      assert.equal(payload.user, undefined);
      assert.equal(payload.metadata, undefined);
      assert.ok(init?.signal);
      return response(preview);
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, preview);
  assert.equal(result.medications[0]?.dosage, null);
});
test('provider failures, refusals and unsafe schemas fail closed without retrying or disclosing errors', async () => {
  for (const transport of [
    async () => new Response('secret-provider-diagnostic', { status: 500 }),
    async () => {
      throw new Error('secret-key');
    },
    async () => response({ ...preview, patientName: 'not-allowed' }),
    async () =>
      new Response(JSON.stringify({ status: 'incomplete', output: [] })),
    async () =>
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'refusal', text: 'refused' }],
            },
          ],
        }),
      ),
  ]) {
    let calls = 0;
    await assert.rejects(
      extractWithOpenAI('secret', 'model', Buffer.from('crop'), async () => {
        calls++;
        return transport();
      }),
      { code: 'PRESCRIPTION_SCAN_FAILED' },
    );
    assert.equal(calls, 1);
  }
  assert.equal(
    scanResultSchema.safeParse({
      ...preview,
      medications: [{ ...preview.medications[0], dosage: 0 }],
    }).success,
    false,
  );
});
test('scan preparation removes embedded EXIF including identity metadata and emits a bounded JPEG', async () => {
  const bytes = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: '#ffffff' },
  })
    .withExif({
      IFD0: {
        Artist: 'SYNTHETIC PERSONAL IDENTIFIER',
        ImageDescription: 'SYNTHETIC PRIVATE NOTE',
      },
    })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(bytes).metadata()).exif);
  const clean = await prepareScanImage({
    buffer: bytes,
    mimetype: 'image/jpeg',
  });
  const meta = await sharp(clean).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 2400);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  assert.equal(
    clean.includes(Buffer.from('SYNTHETIC PERSONAL IDENTIFIER')),
    false,
  );
  await assert.rejects(
    prepareScanImage({
      buffer: Buffer.from('not-image'),
      mimetype: 'image/jpeg',
    }),
  );
});
test('controller requires both crop attestation and external processing agreement', async () => {
  let calls = 0;
  const controller = new PrescriptionScanController({
    extract: async () => {
      calls++;
      return { data: preview };
    },
  } as unknown as PrescriptionScanService);
  const request = {
    headers: {},
    socket: {},
    requestId: 'synthetic',
    auth: { userId: 'patient', sessionId: 'session', role: 'PATIENT' },
  };
  for (const body of [
    {},
    { externalProcessingConsent: 'true' },
    { medicinesOnlyCropConfirmed: 'true' },
    { externalProcessingConsent: 'true', medicinesOnlyCropConfirmed: 'false' },
    {
      externalProcessingConsent: 'true',
      medicinesOnlyCropConfirmed: 'true',
      patientName: 'no',
    },
  ])
    assert.throws(() => controller.extract(request, body, undefined), {
      code: 'VALIDATION_ERROR',
    });
  assert.equal(calls, 0);
  await controller.extract(
    request,
    { externalProcessingConsent: 'true', medicinesOnlyCropConfirmed: 'true' },
    undefined,
  );
  assert.equal(calls, 1);
});
test('unconfigured service and non-patient roles cannot invoke extraction', async () => {
  const config = readConfig({
    AUTH_SECRET: 'ab'.repeat(32),
    REDIS_URL: 'redis://localhost/1',
    DATABASE_URL: 'postgresql://localhost/test',
  });
  const service = new PrescriptionScanService(
    config,
    {} as RateLimitService,
    {} as DatabaseService,
    {
      configuration: async () => ({
        enabled: true,
        keyConfigured: false,
        effectiveModel: null,
      }),
    } as unknown as AiService,
  );
  assert.deepEqual(await service.capabilities(), {
    enabled: false,
    provider: 'OpenAI',
    requiresCroppedImage: true,
  });
  await assert.rejects(
    service.extract(
      { userId: 'u', sessionId: 's', role: 'PATIENT' },
      undefined,
    ),
    { code: 'PRESCRIPTION_SCAN_NOT_CONFIGURED' },
  );
  await assert.rejects(
    service.extract({ userId: 'u', sessionId: 's', role: 'DOCTOR' }, undefined),
    { code: 'FORBIDDEN' },
  );
});

test('box extraction separates packaging from dose and prescription quantity', async () => {
  const result = await extractWithOpenAI(
    'test-key',
    'test-model',
    Buffer.from('crop'),
    async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.match(payload.instructions, /medicine box/);
      assert.match(payload.instructions, /Month\/year expiry must remain null/);
      return response({
        extractedName: 'Synthetic',
        strength: '500 mg',
        quantity: 20,
        unit: 'TABLET',
        expiryDate: null,
        warnings: [],
      });
    },
    true,
  );
  assert.equal(result.medications[0]?.dosage, null);
  assert.equal(result.medications[0]?.quantity, null);
  assert.equal(result.medications[0]?.scheduledTimes, null);
  assert.ok('packageInfo' in result);
  assert.deepEqual(result.packageInfo, {
    quantity: 20,
    unit: 'TABLET',
    expiryDate: null,
  });
});
