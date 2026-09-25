# API and database foundation

Implemented September 24, 2026. This slice creates the NestJS service, Prisma
database package, initial identity persistence and isolated local PostgreSQL.
At that milestone, registration/login and patient-data routes were absent. The
subsequent [authentication slice](AUTHENTICATION.md) implements those backend routes,
audit_logs, Redis and scoped runtime privileges. Follow that guide for current setup.

## Local setup

Activate Node 24.21.0 and pnpm 11.24.0 as described in [BOOTSTRAP.md](BOOTSTRAP.md).
Docker must be running.

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

The API binds to `127.0.0.1:3000`; PostgreSQL binds only to `127.0.0.1:55432`.
The Compose project is `saydaliyati`, with its own persistent volume. Existing
databases and containers belonging to other projects are not modified.

`setup:local` creates `.env` once with fresh random local credentials and restrictive
file permissions. Existing values are preserved; later setup may append missing settings. `.env.example` contains
placeholders only. Keep `.env` outside Git. Changing a password in `.env` does not
rotate the password of an already initialized PostgreSQL role.

Stop PostgreSQL with `pnpm db:stop`; stop the foreground API with Ctrl+C.
Data is preserved. There is no automatic volume reset or destructive migration.
This Compose file is for local development, not a production deployment.

## Identity persistence

The first migration contains only `user_role`, `user_status`, `language_code`,
`users`, `patient_profiles` and `sessions`. Prisma maps camelCase application fields
to the canonical SQL names from TABLES.md. UUIDs use PostgreSQL's built-in
`gen_random_uuid()`; no extension is needed on the pinned PostgreSQL version.

Database constraints enforce:

- At least one non-null identity; unique email/phone when present.
- Stored email is lowercase, trimmed and nonempty; phone uses a leading `+` and
  international digits. Authentication will normalize and validate inputs before persistence.
- Profile and session owners must exist; deletion of their user is restricted.
- Session expiry follows creation and verification material is nonempty.
- Session lookup index follows `(user_id, revoked_at, expires_at)`.

Patient role checks, IANA timezone validation, password hashing, refresh-token
rotation/replay handling, verification and retention remain authentication work.
The nullable password column follows TABLES.md and does not enable passwordless login.
No session is created by the API in this slice, and no token algorithm is implied
by the schema or test fixtures.

## Database accounts

The local owner account runs migrations. The separate `saydaliyati_app` runtime
account initially had only connection/schema usage privileges. Authentication now
grants narrowly scoped identity/session operations and insert-only audit writes;
see [AUTHENTICATION.md](AUTHENTICATION.md) for the current privilege boundary.
Production requires independently provisioned migration/runtime roles; the local
PostgreSQL owner is a development-only bootstrap superuser.

The `saydaliyati_test` database is separate from development. Integration tooling
refuses non-local hosts and any other database name. Tests apply migrations and
roll back fixture transactions; they do not reset an existing database or import
medicine/health data.

## Operational API

- `GET /api/v1/health/live`: 200 with `{ "data": { "status": "ok" }, "meta": {} }`.
  This is independent of PostgreSQL availability.
- `GET /api/v1/health/ready`: 200 with status `ready` after a real database query
  confirms the three initial tables are present; otherwise 503 with canonical
  `SERVICE_UNAVAILABLE`. This probes connectivity and table presence, not future
  migration drift or the behavior of unimplemented features.

Both routes are intentionally unauthenticated, return no patient or infrastructure
details and use `Cache-Control: no-store`. Responses receive server-generated
`X-Request-Id` values. Unknown routes return `RESOURCE_NOT_FOUND`; unexpected
exceptions return `PROCESSING_FAILED` without original messages, SQL or stacks.
No product route is registered yet. Authentication/authorization must precede
exposure of any patient-data route.

`pnpm openapi:generate` updates [api.openapi.json](api.openapi.json), describing
only implemented operational endpoints. It neither connects to PostgreSQL nor
exposes a Swagger UI. API-CONTRACT.md remains the authority for future features.

## Verification commands

- `pnpm check`: builds database/API, checks formatting, lint, TypeScript, Prisma
  schema, API/configuration tests and specification metadata.
- `pnpm test:integration`: applies migrations to the dedicated test database,
  verifies actual SQL constraints/Prisma mapping/runtime privileges, and exercises
  HTTP readiness with live and unavailable PostgreSQL connections.
- `pnpm db:status`: reports migration status on development PostgreSQL.
- `pnpm openapi:generate`: regenerates the implemented HTTP contract.

Run `pnpm build` after dependency installation before standalone typecheck/test
commands. Prisma client generation is part of the database build and generated
files are ignored by Git, lint and formatting. No postinstall implicitly migrates
or connects to a database.

## Verified result

Build, lint, formatting, TypeScript, Prisma validation and all 25 tests pass
(8 API/configuration tests, 15 database tests and 2 HTTP/database integration tests).
A separate fresh PostgreSQL volume verified automatic role/database initialization,
503 readiness before migration, successful migration, 200 readiness afterward,
idempotent migration reapplication and no Prisma schema divergence. That temporary
verification container and volume were removed after testing.
An offline frozen-lockfile reinstall also passes. The historical audit and design
assets remain byte-for-byte unchanged. No commit or remote was created.

## Version evidence

Checked official package metadata and vendor documentation on September 24, 2026:

- NestJS common/core/platform-express/testing 12.1.0; Node >=20.
- NestJS Swagger 12.0.2; supports NestJS 12 and TypeScript 6.
- Prisma CLI/client/adapter-pg 7.10.0; supports Node 24 and TypeScript >=5.4.
  The CLI's registry latest tag pointed to an 8.0 release candidate, so this slice
  deliberately uses the matching stable 7.10 packages.
- PostgreSQL 17.11, supported major 17 through November 8, 2029. The official
  Alpine image is pinned to its immutable repository digest in Compose.
- pg 8.23.0, @types/pg 8.23.1, Zod 4.6.5, RxJS 7.8.2 and reflect-metadata 0.2.2.

Sources: https://docs.nestjs.com/first-steps,
https://www.prisma.io/docs/orm/reference/prisma-config-reference,
https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client,
https://www.postgresql.org/support/versioning/ and the corresponding exact package
versions on https://registry.npmjs.org/.

pnpm uses the project-local ignored `.pnpm-store` to keep its location consistent
inside and outside the filesystem sandbox. Only Prisma/Prisma-engine installation
scripts were allowed at this milestone; the authentication slice also allows
Argon2 installation scripts. The optional Scarf telemetry script is explicitly denied.

## Subsequent progress

The [authentication slice](AUTHENTICATION.md) resolved the authentication decisions
and implemented registration, login, session rotation and authorization tests,
including Redis rate limits. Catalog, inventory, mobile, background workers, OCR
and deployment remain subsequent work.
