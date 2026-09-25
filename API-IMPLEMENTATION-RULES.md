# Saydaliyati --- API-IMPLEMENTATION-RULES.md

Version: 1.0

## 1. Base path

``` text
/api/v1
```

## 2. Response shape

Success:

``` json
{
  "data": {},
  "meta": {}
}
```

Error:

``` json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## 3. Authentication

Access tokens identify the actor.

Refresh tokens rotate atomically against server-side revocable sessions. Store
only hashes/derived verification material. Protected requests honor session
revocation/expiry; mobile uses secure storage, not ordinary AsyncStorage.

## 4. Authorization

Never accept:

``` text
patientId
userId
ownerId
```

from the client as proof of ownership.

Derive ownership from authenticated context.

## 5. Validation

Validate every external input.

Use Zod shared schemas where appropriate and NestJS boundary validation.
Domain and authorization rules remain server-side.

Reject unexpected fields.

## 6. Pagination

List endpoints must use a consistent pagination strategy.

Do not return unbounded datasets.

## 7. Filtering

Whitelist allowed filters and sort fields.

Never interpolate arbitrary client values into SQL.

## 8. Idempotency

Use idempotency where repeated requests could create duplicate side
effects.

Priority:

-   medication events using stable occurrenceId and database uniqueness
-   share creation where appropriate
-   uploads/jobs
-   notifications

## 9. Files

Validate:

-   size
-   MIME
-   extension
-   content where feasible

Store privately.

## 10. OpenAPI

API implementation should generate/update OpenAPI documentation.

OpenAPI is a contract, not a substitute for authorization tests.

## 11. Error codes

API-CONTRACT.md section 20 is canonical. Use exact codes and the error envelope,
including AUTH_INVALID_CREDENTIALS, AUTH_SESSION_EXPIRED, AUTH_SESSION_REVOKED,
RESOURCE_NOT_FOUND, FORBIDDEN, VALIDATION_ERROR, RATE_LIMITED, SHARE_CODE_INVALID,
SHARE_CODE_EXPIRED, SHARE_CODE_CONSUMED, SHARE_GRANT_REVOKED and PROCESSING_FAILED.
No aliases, internal stack traces or provider errors may reach clients.

## 12. Grant and processing boundaries

Authorize grant-scoped endpoints against AccessGrant and recursive permission
projections, never bootstrap expiry. OCR processingStatus and business status are
separate. Private ordered document access verifies parent and document ownership.

