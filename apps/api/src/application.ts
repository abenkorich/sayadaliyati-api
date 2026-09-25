import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AuthRequest } from './auth/auth.guard.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { ApiConfig } from './config.js';
import { HttpErrorFilter } from './http-error.filter.js';

export async function configureApplication(
  app: INestApplication,
): Promise<void> {
  app.setGlobalPrefix('api/v1');
  app.use(
    (_request: IncomingMessage, response: ServerResponse, next: () => void) => {
      const requestId = randomUUID();
      (_request as IncomingMessage & AuthRequest).requestId = requestId;
      response.setHeader('X-Request-Id', requestId);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
  );
  (app as NestExpressApplication).useBodyParser('json', { limit: '16kb' });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.init();
  // Nest's not-found handler is scoped to the global prefix. Handle requests
  // outside /api/v1 as JSON as well, after all framework routes are registered.
  app.use((_request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Resource not found.',
          details: {},
        },
      }),
    );
  });
}

export async function createApplication(config: ApiConfig) {
  const app = await NestFactory.create(AppModule.register(config), {
    logger: ['error', 'warn', 'log'],
    abortOnError: false,
    bodyParser: false,
  });
  await configureApplication(app);
  return app;
}
