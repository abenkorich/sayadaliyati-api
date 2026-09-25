import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ApiError } from './auth/errors.js';

interface ErrorResponse {
  status(code: number): ErrorResponse;
  json(body: unknown): void;
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const parserStatus =
      exception instanceof Error && 'type' in exception
        ? exception.type === 'entity.too.large'
          ? 413
          : exception.type === 'entity.parse.failed'
            ? 400
            : 500
        : 500;
    const status =
      exception instanceof ApiError
        ? exception.status
        : exception instanceof HttpException
          ? exception.getStatus()
          : parserStatus;
    const responses: Record<number, [string, string]> = {
      400: ['VALIDATION_ERROR', 'Invalid request.'],
      401: ['AUTH_REQUIRED', 'Authentication is required.'],
      403: ['FORBIDDEN', 'Access is denied.'],
      404: ['RESOURCE_NOT_FOUND', 'Resource not found.'],
      413: ['FILE_TOO_LARGE', 'Request is too large.'],
      429: ['RATE_LIMITED', 'Too many requests.'],
      503: ['SERVICE_UNAVAILABLE', 'Service temporarily unavailable.'],
    };
    const [code, message] =
      exception instanceof ApiError
        ? [exception.code, exception.message]
        : (responses[status] ?? [
            'PROCESSING_FAILED',
            'Request could not be processed.',
          ]);
    host
      .switchToHttp()
      .getResponse<ErrorResponse>()
      .status(status)
      .json({
        error: { code, message, details: {} },
      });
  }
}
