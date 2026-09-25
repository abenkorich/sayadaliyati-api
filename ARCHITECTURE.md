# Technical Architecture

## 1. Target stack

### Mobile

-   React Native
-   Expo
-   TypeScript (strict mode)
-   Expo Router
-   TanStack Query
-   secure token storage
-   i18n with RTL support

### Backend

-   NestJS
-   TypeScript (strict mode)
-   REST API
-   PostgreSQL through Prisma
-   Redis
-   BullMQ background workers
-   private S3-compatible storage (MinIO locally)

### Infrastructure

-   Docker
-   Docker Compose for initial deployment
-   Nginx reverse proxy
-   TLS
-   automated backups
-   monitoring and structured logs

## 2. Monorepo

``` text
saydaliyati/
├── apps/
│   ├── mobile/
│   ├── api/
│   ├── worker/
│   └── admin/
├── packages/
│   ├── database/
│   ├── types/
│   ├── validation/
│   ├── api-client/
│   ├── medicine/
│   ├── sharing/
│   └── ai/
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   ├── postgres/
│   └── monitoring/
├── scripts/
│   └── medicine-import/
├── docs/
└── docker-compose.yml
```

## 3. Runtime architecture

``` text
Mobile
  |
 HTTPS
  v
Nginx
  |
  v
NestJS API
  |       \
  |        \--> Redis
  |
  +-------> PostgreSQL
  |
  +-------> Object Storage

Redis --> Worker
           |
           +--> OCR / Vision
           +--> AI jobs
           +--> notifications
           +--> expiry jobs
           +--> medicine imports
```

## 4. Hard architectural rules

1.  Mobile never connects directly to PostgreSQL.
2.  Mobile never receives database credentials.
3.  AI never receives unrestricted SQL access.
4.  AI accesses patient data only through typed tools.
5.  Every protected endpoint requires authentication.
6.  Every shared resource requires explicit authorization.
7.  OCR/vision output is untrusted until user-confirmed.
8.  Long-running work belongs in the worker.
9.  API instances should be stateless.
10. All schema changes must use migrations.

## 5. API versioning

Base path:

`/api/v1`

Example:

`GET /api/v1/medicines/:id`

## 6. Environment separation

Use separate environments:

-   development
-   staging
-   production

Secrets must never be committed to Git.

## 7. Initial VPS

The first production VPS may host:

-   nginx
-   API
-   worker
-   PostgreSQL through Prisma
-   Redis
-   monitoring

Design the services so PostgreSQL, Redis and workers can later move to
managed services or separate servers without changing application
contracts.

## 8. Background jobs

Use a Redis-backed queue for:

-   OCR
-   vision processing
-   AI processing where asynchronous
-   notifications
-   expiry scans
-   low-stock calculations
-   medicine data imports
-   audit/analytics aggregation where appropriate

Jobs must be idempotent where practical.

## 9. Observability

Every service should provide:

-   structured logs
-   request correlation ID
-   error tracking
-   health endpoint
-   readiness endpoint
-   queue health
-   database health

Never log passwords, access tokens, raw prescription images or
unnecessary health information.

## 10. Approved foundation (2026-09-14)

Use pnpm workspaces. Share Zod schemas where appropriate; NestJS validates every
API boundary. Keep authorization and domain rules on the server rather than
copying them into clients. TanStack Query manages mobile server state.
Redis-backed queues use BullMQ. Root-level specifications remain authoritative;
`docs/decisions/foundation-proposal.md` records approved decisions and open items.

At bootstrap, verify mutually compatible, currently supported stable versions
and pin them in actual tooling and lockfiles. Product specifications do not pin
arbitrary historical versions. No scaffolding is authorized by this document update.

Authentication uses short-lived access tokens, rotating refresh tokens, and a
server-side revocable `sessions` record. PostgreSQL stores only refresh-token
hashes/derived verification material. Mobile persistent credentials use platform
secure storage, never ordinary AsyncStorage. Authenticated actor context is
server-derived; access-token session references must honor revocation.

ShareSession bootstraps AccessGrant. Only the recipient-bound AccessGrant and
its permissions authorize subsequent shared reads; bootstrap expiry does not
revoke grants. OCR jobs use their own processing state, separate from prescription
business state. Multiple ordered prescription documents remain in private storage.
