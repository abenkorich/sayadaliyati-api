# Backend authentication

Implemented September 24, 2026. The policy is recorded in
[decisions/authentication.md](decisions/authentication.md). This slice includes
registration, login, rotating sessions, logout and the patient profile API.

## Run locally

Activate the pinned Node/pnpm versions from [BOOTSTRAP.md](BOOTSTRAP.md), then:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:up
pnpm db:migrate
pnpm db:grant-local
pnpm check
pnpm test:integration
pnpm api:start
```

`setup:local` preserves existing environment values and appends missing auth/Redis
settings. It creates random local secrets; never copy them into docs or commit `.env`.
Re-running setup does not rotate existing secrets. Root-secret rotation invalidates
existing access/refresh credentials and requires login again.

PostgreSQL listens only on `127.0.0.1:55432`; password-protected Redis listens only
on `127.0.0.1:56379`. Both have dedicated Compose volumes. Redis persists rate
counters using AOF, bounded key TTLs, 128 MiB memory and no eviction; exhaustion
fails authentication closed. `pnpm db:stop` stops both services without deleting data.

Local grants are separate from portable migrations. They allow identity inserts
using database-default roles, last-login updates, profile operations and session
rotation/revocation. They forbid role/status changes, user deletes, schema writes
and audit updates/deletes. Production must provision equivalent least-privilege
grants for its own runtime role; `db:grant-local` refuses non-local databases.

## Routes and client behavior

All paths begin with `/api/v1`. Successes return `{data, meta}` and failures return
`{error: {code, message, details}}`. Responses are not cacheable. The generated
[OpenAPI contract](api.openapi.json) includes request and response schemas.

- `POST /auth/register`: email and/or international phone, password, names,
  language and IANA timezone. Creates only PATIENT/ACTIVE. Returns 201 with user
  ID/role, accessToken and refreshToken. Verification timestamps remain null.
- `POST /auth/login`: identifier plus password. Returns 200 with the same projection
  and creates an independent session.
- `POST /auth/refresh`: refreshToken only. Returns 200 with a replacement token pair.
- `POST /auth/logout`: bearer access token; empty or absent JSON body. Revokes only
  the current session. Repeating with the same unexpired access token succeeds.
- `GET /me/profile`: bearer token; returns only the authenticated patient's names,
  language, timezone, email and phone.
- `PATCH /me/profile`: only firstName, lastName, preferredLanguage and timezone.
  Client-supplied IDs, role and identifier updates are rejected.

Access lasts at most 10 minutes. Every protected request rechecks the session and
account in PostgreSQL, so revocation does not wait for JWT expiry. Sessions expire
30 days after creation, without extension. Authentic old-refresh reuse commits
session revocation, including when requests race. Clients must serialize refresh
requests; a lost rotation response requires login again. Forged refresh signatures
cannot revoke a guessed session. No access/refresh credential is stored in plaintext.

Unknown accounts and wrong passwords have identical login errors. Duplicate
registration returns generic VALIDATION_ERROR without naming a conflicting field.
All routes are protected unless explicitly marked public; only health, registration,
login and refresh are currently public. Roles/ownership never come from request bodies.

Future mobile work must use platform secure storage, replace refresh tokens atomically,
serialize renewal and clear credentials/account caches on logout. This slice does
not implement those mobile behaviors.

## Abuse protection and audit

Redis enforces shared atomic fixed windows per IP and, where appropriate, normalized
identifier or authentic session. Keys contain only HMAC-derived identities. Numerical
budgets are in the decision record. Structural validation failures count against IP
budgets; malformed/oversized JSON is rejected earlier by the 16 KiB parser before
credential work. Forwarded-IP headers remain untrusted until a trusted proxy topology
is explicitly configured.

Readiness requires implemented identity/audit/catalog/inventory/prescription tables and Redis; liveness is independent.
Redis failure prevents login, refresh and protected access. Public health/error
responses do not reveal connection details, SQL, passwords or tokens.

Session create/rotate/revoke/replay events and profile changes write audit records
transactionally. Failed logins write a minimal denial event. Audit metadata contains
only outcome and server request ID, never submitted identifiers or profile values.
If required audit insertion fails, the associated mutation rolls back.

## Tests

`pnpm check` runs build, typecheck, lint, formatting, Prisma checks, unit/API/crypto
tests and documentation integrity. `pnpm test:integration` uses only the local
`saydaliyati_test` database and Redis database 1, applying migrations and scoped grants.

Tests create synthetic accounts, clean up only their rows and reset authentication
counters in test Redis DB 1. They never flush development Redis DB 0 or reset the
development database. Do not run multiple copies against the same test Redis DB.

Coverage includes owner isolation, forbidden role changes, duplicates, missing/forged
credentials, disabled accounts, expiry, concurrent refresh/replay, idempotent logout,
per-session revocation, audit rollback, rate limits and unavailable dependencies.

## Dependencies and remaining scope

Pinned additions: argon2 0.45.1, jose 6.2.12 and ioredis 6.0.0. Shared Zod schemas
live in `@saydaliyati/validation`. The official Redis 8 Alpine image is pinned by
digest. Existing Node/pnpm/NestJS/Prisma versions are unchanged.

Primary references:

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://github.com/ranisalt/node-argon2
- https://github.com/panva/jose
- https://redis.io/docs/latest/commands/incr/

This is a backend development milestone. Mobile screens/secure storage, email/SMS
verification, recovery, professional provisioning, production retention and deployment
remain future work. No production account, external message, remote or commit is created.
