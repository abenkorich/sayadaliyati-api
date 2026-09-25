# Private prescription documents

Implemented September 25, 2026. Patients can attach original image pages to
existing DRAFT prescriptions and obtain audited private download links. This is
an attachment workflow; it does not queue OCR, extract medication data, or confirm
prescriptions. The scan endpoint remains unavailable until an actual processor
can accept work.

## API

All routes require an active PATIENT session and use the protected Redis rate
budget. Professional/admin roles have no bypass. Other patients' parent/document
IDs return 404. Paths below include the `/api/v1` prefix.

- `POST /api/v1/me/prescriptions/:id/documents`: multipart form with exactly one
  `file` and a string `pageNumber`. Append the next consecutive page, starting at
  1, with a maximum of 20 pages. One request commits one page and returns 201 with
  `{data: {id, pageNumber, mimeType, processingStatus: "UPLOADED"}, meta: {}}`.
- `GET /api/v1/me/prescriptions/:id/documents/:documentId/download`: return 200
  with `{data: {url, expiresAt}, meta: {}}`. Links expire after at most 60 seconds,
  further limited by a document's non-null retention deadline. Expired/deleted
  documents cannot receive new links. A missing object/storage failure returns
  sanitized SERVICE_UNAVAILABLE (503).

Upload JPEG or PNG only, with matching declared MIME and signature. The server
fully decodes the raster with strict error handling, rejects multiple frames,
limits each original to 5 MiB and decoded images to 20 million pixels. SVG, PDF,
HEIC and arbitrary file references are not accepted. Images are not rewritten;
original bytes and metadata, including any embedded location data, are retained.
Clients should remove unwanted metadata before upload. Decoding is not a malware
scanner or clinical document authenticity check.

Client filenames never determine object keys or download names. Object keys use
random UUIDs and do not contain patient IDs/names. At most two upload requests per
API process may buffer/decode concurrently; overload returns 503. Multipart
fields/files are bounded. Public deployment still requires an ingress body-size,
connection-rate and upload-timeout policy. No aggregate patient storage quota or
malware-scanning service is implemented in this development slice.

Uploads serialize on the parent row. Duplicate, skipped or stale page numbers,
and uploads to non-DRAFT prescriptions, return DOCUMENT_CONFLICT (409). To recover
from an ambiguous upload response, fetch prescription detail and reconcile page
metadata before deciding whether to retry. The API does not replace pages or
blindly append a retried page. Multi-page uploads are a sequence of independently
committed requests, not an atomic batch.

Attachments do not change MANUAL source, the header's null processingStatus,
field revisions, or prescription business status. Document-level status is
UPLOADED. Archived prescriptions retain owner download access but reject new
uploads. Ordinary list/detail responses contain metadata only, never object keys
or signed URLs.

## Storage and audit guarantees

Use a private, non-public S3-compatible bucket. URLs are bearer capabilities:
anyone holding an issued URL can use it until expiry. Logout, deletion or a future
sharing revocation prevents subsequent issuance; an already issued link is not
revoked by the API. Immediate revocation of in-flight/already issued byte access
is not implemented. No shared-recipient download route is enabled.

Every issuance rechecks the active session, current patient role, parent ownership,
document membership and lifecycle. Upload and download issuance each require a
committed sanitized audit event (DOCUMENT_UPLOADED / DOCUMENT_DOWNLOAD_ISSUED).
Metadata contains request ID/result only. URLs, storage credentials, filenames and
image contents are excluded. HTTP responses and object downloads use no-store;
downloads force attachment disposition with a generated filename.

PostgreSQL metadata and audit commit together. Uploads use unique object keys and
conditional object creation. On failure, cleanup waits for the original parent
lock and checks for a committed row before deleting unreferenced bytes. A process
crash or unavailable DB/storage can still leave a private orphan: there is no
distributed transaction between PostgreSQL and S3. A sanitized warning records
cleanup failure. Production reconciliation/retention/purge jobs remain necessary;
no automatic lifecycle rule deletes committed patient documents.

The runtime role gains document INSERT on explicit columns and SELECT of the
private storage key/retention deadline for authorized download logic. It cannot
UPDATE or DELETE document rows. Other database grants remain scoped. No schema
migration is needed; the existing document model already supports these fields.

## Local setup

```sh
pnpm setup:local
pnpm db:up
pnpm storage:up
pnpm storage:init
pnpm build
pnpm db:migrate
pnpm db:grant-local
pnpm api:start
```

`setup:local` appends missing settings without rotating existing secrets. MinIO is
an opt-in Compose profile, bound only to 127.0.0.1:59000, with a private named
volume, browser console disabled and a non-root container user. `storage:init`
creates/verifies separate `saydaliyati-documents` and `saydaliyati-documents-test`
buckets, refusing unexpected existing bucket policies. It only accepts local
endpoints. Stop it with `pnpm storage:stop`. Do not delete the volume to reset tests.

The local container is built from upstream MinIO commit
`9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`, the source-only
[October 2025 security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z),
using the matching pinned Go builder image. This archived upstream implementation
is a local compatibility fixture, not a production storage recommendation. No
production provider or deployment is selected here.

Local credentials have administrative access only for this isolated development
store. A production deployment must use dedicated least-privilege credentials
(GetObject, PutObject and DeleteObject only on the document prefix), a private
bucket with public access blocked, TLS, encryption at rest, controlled backups,
and agreed retention/provider terms. Runtime code does not create buckets or
modify access policies.

Configuration is all-or-none: DOCUMENT_STORAGE_ENDPOINT, DOCUMENT_STORAGE_BUCKET,
DOCUMENT_STORAGE_ACCESS_KEY, DOCUMENT_STORAGE_SECRET_KEY; region defaults to
us-east-1. Production endpoints require HTTPS. The endpoint must be a plain
origin without embedded credentials, query or path. With no storage configuration,
the API still starts and document operations fail closed with 503. Existing
health readiness checks PostgreSQL/Redis only; it does not attest storage health.
Do not rewrite the host of an issued URL: the signed origin must be reachable by
the client. Android connectivity remains deferred.

S3 operations/signing use the official
[AWS SDK v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html).
Image decoding uses [sharp's input limits](https://sharp.pixelplumbing.com/security/).
All package versions are pinned in the lockfile.

## Verification

Run `pnpm check` and `pnpm test:integration` after local setup. Tests use synthetic
images and scoped rows/keys; development buckets are untouched by tests. The
integration suite refuses remote DB/Redis/storage endpoints and runs serially.
It verifies real private object uploads/downloads, anonymous denial, signature
TTL, byte integrity, ownership/membership, retention/deletion, concurrent page
ordering, invalid/oversized files, archived access, restricted grants and audit
failure cleanup. Unit tests verify complete JPEG/PNG decoding and pixel limits.

### Verified result

`pnpm check` passed (build, formatting, lint, strict types, schema checks and
27 unit/API tests). `pnpm test:integration` passed 17 database and 79 HTTP/storage
tests: 123 unique tests overall. The latter includes an unavailable storage
endpoint and verifies that no metadata/link is returned on failure. Frozen offline
installation and documentation integrity passed. The local-secret scan found no
secrets in Git-visible files; `.env` remains ignored with mode 0600. No commit or
remote operation was performed.
