import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const ownerPassword = randomBytes(24).toString('hex');
const appPassword = randomBytes(24).toString('hex');
const redisPassword = randomBytes(24).toString('hex');
const storagePassword = randomBytes(32).toString('hex');
const storageValues = {
  MINIO_ROOT_USER: 'saydaliyati-local',
  MINIO_ROOT_PASSWORD: storagePassword,
  MINIO_PORT: '59001',
  DOCUMENT_STORAGE_ENDPOINT: 'http://127.0.0.1:59001',
  DOCUMENT_STORAGE_BUCKET: 'saydaliyati-documents',
  DOCUMENT_STORAGE_REGION: 'us-east-1',
  DOCUMENT_STORAGE_ACCESS_KEY: 'saydaliyati-local',
  DOCUMENT_STORAGE_SECRET_KEY: storagePassword,
};
const values = {
  ...storageValues,
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: '3001',
  POSTGRES_PORT: '55433',
  POSTGRES_PASSWORD: ownerPassword,
  APP_DB_PASSWORD: appPassword,
  AUTH_SECRET: randomBytes(32).toString('hex'),
  REDIS_PASSWORD: redisPassword,
  REDIS_PORT: '56380',
  REDIS_URL: `redis://:${redisPassword}@127.0.0.1:56380/0`,
  TEST_REDIS_URL: `redis://:${redisPassword}@127.0.0.1:56380/1`,
  DATABASE_URL: `postgresql://saydaliyati_app:${appPassword}@127.0.0.1:55433/saydaliyati`,
  MIGRATION_DATABASE_URL: `postgresql://saydaliyati_owner:${ownerPassword}@127.0.0.1:55433/saydaliyati`,
  TEST_DATABASE_URL: `postgresql://saydaliyati_owner:${ownerPassword}@127.0.0.1:55433/saydaliyati_test`,
  TEST_RUNTIME_DATABASE_URL: `postgresql://saydaliyati_app:${appPassword}@127.0.0.1:55433/saydaliyati_test`,
};

try {
  writeFileSync(
    new URL('../.env', import.meta.url),
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Created private local .env. Start PostgreSQL with pnpm db:up.');
} catch (error) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'EEXIST'
  ) {
    const file = new URL('../.env', import.meta.url);
    const current = parseEnv(readFileSync(file, 'utf8'));
    const password = current['REDIS_PASSWORD'] ?? redisPassword;
    const port = current['REDIS_PORT'] ?? '56380';
    const additions = Object.entries({
      ...storageValues,
      MINIO_ROOT_PASSWORD: current['MINIO_ROOT_PASSWORD'] ?? storagePassword,
      DOCUMENT_STORAGE_ACCESS_KEY:
        current['MINIO_ROOT_USER'] ?? storageValues.MINIO_ROOT_USER,
      DOCUMENT_STORAGE_SECRET_KEY:
        current['MINIO_ROOT_PASSWORD'] ?? storagePassword,
      DOCUMENT_STORAGE_ENDPOINT: `http://127.0.0.1:${current['MINIO_PORT'] ?? '59001'}`,
      AUTH_SECRET: randomBytes(32).toString('hex'),
      REDIS_PASSWORD: password,
      REDIS_PORT: port,
      REDIS_URL: `redis://:${encodeURIComponent(password)}@127.0.0.1:${port}/0`,
      TEST_REDIS_URL: `redis://:${encodeURIComponent(password)}@127.0.0.1:${port}/1`,
    }).filter(([key]) => current[key] === undefined);
    if (additions.length)
      appendFileSync(
        file,
        '\n' +
          additions.map(([key, value]) => `${key}=${value}`).join('\n') +
          '\n',
      );
    console.log(
      `Preserved existing .env values; added ${additions.length} missing local settings.`,
    );
  } else {
    throw error;
  }
}
