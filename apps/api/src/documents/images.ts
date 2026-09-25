import sharp from 'sharp';
import { ApiError } from '../auth/errors.js';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 20;
export interface DocumentImage {
  buffer: Buffer;
  mimetype: string;
}

// Decode the entire raster, not merely its header. Originals are retained;
// downloads use attachment disposition and never interpolate supplied filenames.
export async function validateDocumentImage(file: DocumentImage | undefined) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length)
    throw new ApiError('VALIDATION_ERROR');
  if (file.buffer.length > MAX_DOCUMENT_BYTES)
    throw new ApiError('FILE_TOO_LARGE');
  const png = file.buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
  if ((!png && !jpeg) || file.mimetype !== (png ? 'image/png' : 'image/jpeg'))
    throw new ApiError('FILE_UNSUPPORTED_TYPE');
  try {
    const image = sharp(file.buffer, {
      failOn: 'warning',
      limitInputPixels: 20_000_000,
      animated: true,
    });
    const metadata = await image.metadata();
    if (
      (metadata.pages ?? 1) !== 1 ||
      metadata.format !== (png ? 'png' : 'jpeg')
    )
      throw new Error('Unsupported image');
    await image.raw().toBuffer();
  } catch {
    throw new ApiError('VALIDATION_ERROR');
  }
  return { bytes: file.buffer, mimeType: png ? 'image/png' : 'image/jpeg' };
}
