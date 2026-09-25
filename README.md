# sayadaliyati-api

Independent backend repository for Saydaliyati. Contains the NestJS HTTP API,
reminder worker, Prisma schema and migrations, backend validation, tests and local
infrastructure. The mobile client lives in the separate sayadaliyati-app repository.
No sibling checkout is required to install, build or run this repository.

## Requirements

Node 24.21.0, pnpm 11.24.0, Docker Compose for local dependencies.

## Local setup

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:up
pnpm db:migrate
pnpm db:grant-local
pnpm build
pnpm start
```

Run `pnpm worker:start` in another terminal for reminder inbox delivery.
Optional documents: `pnpm storage:up` then `pnpm storage:init`.
Optional synthetic catalog: `pnpm db:seed-catalog` (DEMO data only).

The copied repo has a distinct Compose project and local ports: API 3001,
PostgreSQL 55433, Redis 56380, private storage 59001. Existing monorepo services
and data were not moved. setup:local creates fresh ignored credentials; no actual
.env, signing key, database volume or dependency directory was copied.

## Commands

- `pnpm check`: build, format, lint, types, schema and unit checks.
- `pnpm test:integration`: dedicated local PostgreSQL/Redis/storage tests.
- `pnpm openapi:generate`: regenerate docs/api.openapi.json for app consumers.
- `pnpm metadata:update`: refresh documentation checksums after doc edits.

## VPS handoff

You manage deployment, domain, TLS and secrets. Local docker-compose.yml runs
development dependencies only. Use the separate Dockerfile and compose.api.yml
for the API/worker image; see [Docker setup](docs/DOCKER.md).
Provide DATABASE_URL (restricted runtime role), MIGRATION_DATABASE_URL (migration
role), AUTH_SECRET, REDIS_URL, NODE_ENV=production, HOST and PORT to the processes.
For attachments, provide the DOCUMENT_STORAGE_* settings documented in .env.example;
production storage requires HTTPS. Provision database privileges using the SQL
policy in packages/database/prisma/local-runtime-grants.sql as a reference; the
local grant script deliberately refuses remote databases. Do not run local setup
scripts to provision production secrets or create production accounts.

Build with `pnpm install --frozen-lockfile` and `pnpm build`, apply migrations via
`pnpm db:migrate`, then supervise API (`pnpm start`) and worker
(`pnpm worker:start`) as separate processes. Scripts accept injected environment
variables without requiring a checked-out .env file. Keep database/Redis private.
Only expose the API through your HTTPS reverse proxy.

## Repository split

Internal @saydaliyati/* package names and com.saydaliyati.app identity are unchanged;
repository naming does not require changing the API contract or application ID.
[Split notes](docs/REPOSITORY-SPLIT.md) describe verification and contract exchange.
Root specifications and older milestone documents retain their original monorepo
context; this README and the split notes are the current setup entry points.

No remote, commit or push was created automatically.

## API container and persistent files

[Docker instructions](docs/DOCKER.md) cover image builds, API/worker processes,
one-off migrations and a named or bind-mounted `/usr/src/app/dev_data` for retained
imports, exports and configuration files.

## Web portal

The approved `saydaliyati-web` Next.js application is the browser version of the
patient app. It ports all currently implemented mobile features and retains the
mobile theme, using the separate `sayadaliyati-api` REST backend. See the
[web portal blueprint](docs/WEB-PORTAL.md) for scope, session security, responsive
UX and acceptance criteria. Implementation is assigned to a separate task.
