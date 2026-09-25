import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
const endpoint = process.env['DOCUMENT_STORAGE_ENDPOINT'];
if (!endpoint) throw new Error('Run pnpm setup:local first.');
const url = new URL(endpoint);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  throw new Error('Storage initialization is local-only.');
const client = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env['DOCUMENT_STORAGE_ACCESS_KEY'],
    secretAccessKey: process.env['DOCUMENT_STORAGE_SECRET_KEY'],
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
});
try {
  for (const Bucket of [
    'saydaliyati-documents',
    'saydaliyati-documents-test',
  ]) {
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404)
        // eslint-disable-next-line preserve-caught-error -- Do not print storage provider internals or credentials.
        throw new Error(
          'Local storage is unavailable or credentials are invalid.',
        );
      await client.send(new CreateBucketCommand({ Bucket }));
    }
    try {
      await client.send(new GetBucketPolicyCommand({ Bucket }));
      throw new Error(
        'Local document bucket has an unexpected access policy. Review it before use.',
      );
    } catch (error) {
      if (error.name !== 'NoSuchBucketPolicy') throw error;
    }
  }
  console.log('Verified private development and test document buckets.');
} finally {
  client.destroy();
}
