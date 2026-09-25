import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createApplication } from './application.js';
import { readConfig } from './config.js';

// Generating the operational contract makes no database connection.
const app = await createApplication(
  readConfig({
    NODE_ENV: 'test',
    AUTH_SECRET: 'ab'.repeat(32),
    REDIS_URL: 'redis://127.0.0.1:1/1',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  }),
);
try {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Saydaliyati API')
      .setDescription(
        'Implemented health, authentication, patient-profile, medicine catalog, patient inventory and manual prescription drafts endpoints. Future routes remain specified in API-CONTRACT.md.',
      )
      .setVersion('0.0.0')
      .addBearerAuth()
      .build(),
  );
  writeFileSync(
    fileURLToPath(new URL('../../../docs/api.openapi.json', import.meta.url)),
    `${JSON.stringify(document, null, 2)}\n`,
  );
} finally {
  await app.close();
}
