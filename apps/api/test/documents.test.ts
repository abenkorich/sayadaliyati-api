import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  validateDocumentImage,
  MAX_DOCUMENT_BYTES,
} from '../src/documents/images.js';
import { readConfig } from '../src/config.js';
import { DocumentStorage } from '../src/documents/storage.service.js';
const base = {
  AUTH_SECRET: 'a'.repeat(64),
  REDIS_URL: 'redis://localhost/1',
  DATABASE_URL: 'postgresql://localhost/test',
};
test('document validation fully decodes JPEG and PNG without altering original bytes', async () => {
  for (const format of ['png', 'jpeg'] as const) {
    const buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
    })
      [format]()
      .toBuffer();
    const result = await validateDocumentImage({
      buffer,
      mimetype: `image/${format}`,
    });
    assert.equal(result.bytes, buffer);
    assert.equal(result.mimeType, `image/${format}`);
  }
});
test('document validation rejects forged MIME, truncated raster data, empty and oversized files', async () => {
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  for (const file of [
    undefined,
    { buffer: Buffer.alloc(0), mimetype: 'image/png' },
    { buffer: buffer.subarray(0, 40), mimetype: 'image/png' },
  ])
    await assert.rejects(validateDocumentImage(file), {
      code: 'VALIDATION_ERROR',
    });
  for (const file of [
    { buffer, mimetype: 'image/jpeg' },
    { buffer: Buffer.from('<svg></svg>'), mimetype: 'image/png' },
  ])
    await assert.rejects(validateDocumentImage(file), {
      code: 'FILE_UNSUPPORTED_TYPE',
    });
  await assert.rejects(
    validateDocumentImage({
      buffer: Buffer.alloc(MAX_DOCUMENT_BYTES + 1),
      mimetype: 'image/png',
    }),
    { code: 'FILE_TOO_LARGE' },
  );
});
test('document validation rejects decompression bombs above the pixel budget', async () => {
  const buffer = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  assert.ok(buffer.length < MAX_DOCUMENT_BYTES);
  await assert.rejects(
    validateDocumentImage({ buffer, mimetype: 'image/png' }),
    { code: 'VALIDATION_ERROR' },
  );
});
test('storage configuration is optional but partial configuration and insecure production endpoints fail', () => {
  const storage = new DocumentStorage(readConfig(base));
  assert.throws(() => storage.requireConfigured(), {
    code: 'SERVICE_UNAVAILABLE',
  });
  assert.throws(() =>
    readConfig({ ...base, DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000' }),
  );
  const complete = {
    ...base,
    DOCUMENT_STORAGE_ENDPOINT: 'https://storage.example.test',
    DOCUMENT_STORAGE_BUCKET: 'private-documents',
    DOCUMENT_STORAGE_ACCESS_KEY: 'local-key',
    DOCUMENT_STORAGE_SECRET_KEY: 's'.repeat(32),
  };
  assert.doesNotThrow(() =>
    readConfig({ ...complete, NODE_ENV: 'production' }),
  );
  for (const endpoint of [
    'http://storage.example.test',
    'https://user:password@storage.example.test',
    'https://storage.example.test/path',
    'https://storage.example.test?token=secret',
  ])
    assert.throws(() =>
      readConfig({
        ...complete,
        NODE_ENV: 'production',
        DOCUMENT_STORAGE_ENDPOINT: endpoint,
      }),
    );
});
