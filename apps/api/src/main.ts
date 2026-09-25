import { createApplication } from './application.js';
import { readConfig } from './config.js';

try {
  const config = readConfig(process.env);
  const app = await createApplication(config);
  await app.listen(config.PORT, config.HOST);
} catch {
  // Startup errors can contain credentials/connection strings. Keep logs safe.
  console.error(
    'API startup failed. Check environment configuration and service availability.',
  );
  process.exitCode = 1;
}
