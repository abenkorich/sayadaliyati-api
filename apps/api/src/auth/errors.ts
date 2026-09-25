export const AUTH_ERRORS = {
  AUTH_REQUIRED: [401, 'Authentication is required.'],
  AUTH_INVALID_CREDENTIALS: [401, 'Invalid credentials.'],
  AUTH_SESSION_EXPIRED: [401, 'Session expired.'],
  AUTH_SESSION_REVOKED: [401, 'Session revoked.'],
  AUTH_ACCOUNT_DISABLED: [403, 'Account disabled.'],
  AUTH_ACCOUNT_SUSPENDED: [403, 'Account suspended.'],
  RESOURCE_NOT_FOUND: [404, 'Resource not found.'],
  PRESCRIPTION_REVIEW_CONFLICT: [
    409,
    'Prescription review changed. Reload before reviewing again.',
  ],
  DOCUMENT_CONFLICT: [
    409,
    'Document page order or prescription state changed. Reload before uploading.',
  ],
  FILE_UNSUPPORTED_TYPE: [415, 'Unsupported file type.'],
  FILE_TOO_LARGE: [413, 'Request is too large.'],
  TREATMENT_CONFLICT: [409, 'Treatment state does not permit this operation.'],
  SCHEDULE_TIME_INVALID: [
    400,
    'A scheduled local time is ambiguous or does not exist.',
  ],
  PRESCRIPTION_CONFIRMATION_REQUIRED: [
    409,
    'Explicit complete prescription review is required.',
  ],
  MEDICATION_EVENT_CONFLICT: [
    409,
    'An event with different values already exists for this occurrence.',
  ],
  FORBIDDEN: [403, 'Access is denied.'],
  VALIDATION_ERROR: [400, 'Invalid request.'],
  RATE_LIMITED: [429, 'Too many requests.'],
  SERVICE_UNAVAILABLE: [503, 'Service temporarily unavailable.'],
} as const;

export class ApiError extends Error {
  constructor(readonly code: keyof typeof AUTH_ERRORS) {
    super(AUTH_ERRORS[code][1]);
  }
  get status(): number {
    return AUTH_ERRORS[this.code][0];
  }
}
