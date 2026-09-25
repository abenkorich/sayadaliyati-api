# Decision Log

## D001 --- Product name

Saydaliyati / صيدليتي.

## D002 --- Primary mobile stack

React Native + Expo + TypeScript.

## D003 --- Backend

NestJS + TypeScript.

## D004 --- Primary database

PostgreSQL.

## D005 --- Cache/queue

Redis.

## D006 --- AI architecture

AI orchestrates typed application tools; no direct SQL/database access.

## D007 --- Sharing

Six-character short-lived bootstrap codes plus QR.

## D008 --- UX

Modern, attractive, simple, premium-minimal with warmth.

## D009 --- Languages

English, French, Arabic with first-class RTL.

## D010 --- Medicine data model

Medicine master data is separate from patient inventory and treatment
medication.

## D011 — Approved foundation reconciliation (2026-09-14)

[Foundation Decision Record](docs/decisions/foundation-proposal.md) F01–F16 is
approved following the repository audit. The filename does not imply pending
approval. Its DEFERRED / OPEN section is not an approved implementation choice.

- pnpm workspaces, strict TypeScript, Prisma, Expo Router, TanStack Query,
  shared Zod/NestJS boundary validation, Redis/BullMQ, local MinIO and private
  production S3-compatible storage. Keep NestJS/Expo/PostgreSQL/Nginx/Compose.
- Select and pin compatible supported stable versions during bootstrap, in tooling.
- Canonical barcode_type/image_type; positive-or-null prescription quantity;
  mandatory controlled inventory_unit; inventory removal archives via archived_at.
- Rotating refresh tokens, server-side revocable Sessions and mobile secure storage;
  only refresh-token hashes/derived verification material persist in PostgreSQL.
- Six-character ShareSession bootstraps recipient-bound AccessGrant. Code expiry
  never revokes grants; grants have independent expiry/revocation and field scopes.
- DOCTOR/PHARMACY only in V1; caregiver/family/community remain future-only.
- Separate OCR processing and prescription business states, normalized field
  revisions and private multi-page document relationships.
- FIXED_TIMES V1; stable occurrence identity and unique event recording; no complex conversion.
- Notification preferences are MVP persistence; provider/default policies stay open.
- API-CONTRACT.md section 20 is canonical for errors; minimal profile/event/grant/
  preference endpoints are specified; recovery is explicitly deferred.
- Root specifications stay authoritative; no implementation is authorized by this
  documentation-only task. astra_audit.md remains the historical audit.

## D012 — Minimal tooling bootstrap (2026-09-24)

The user authorized the tooling bootstrap following the readiness scan. Local Git,
pnpm workspace discovery, shared strict TypeScript configuration, lint/format/check
commands and refreshed specification metadata are now implemented. See
[docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) for the pinned versions, compatibility evidence
and exact verification scope. This completes the minimal bootstrap, not the full
Phase 0 milestone. Applications, migrations, CI and deployment remain subsequent work.

## D013 — API/database foundation (2026-09-24)

The user requested continuation into the API/database foundation. Implement a
minimal NestJS service and Prisma package, initial users/patient_profiles/sessions
migration, isolated local PostgreSQL, and operational health contracts. Use a
separate restricted runtime role. Add canonical SERVICE_UNAVAILABLE for failed
readiness (503), with no infrastructure details. See
[docs/API-DATABASE-FOUNDATION.md](docs/API-DATABASE-FOUNDATION.md).
Authentication policies from F05 remain open; this slice issues no credentials
and exposes no patient-data endpoints. All later domain tables remain unimplemented.

## D014 — Backend authentication (2026-09-24)

Following user authorization to define authentication parameters and implement the
next slice, [docs/decisions/authentication.md](docs/decisions/authentication.md)
specifies Argon2id, purpose-separated keys, 10-minute access tokens, 30-day absolute
sessions, atomic refresh rotation with replay revocation, Redis rate budgets and
transactional audit. These supersede the algorithm/TTL/replay items left open by F05.
Registration is patient-only with self-declared identifiers; verification timestamps
remain null. Verification delivery, recovery, professional provisioning and production
retention remain unimplemented. See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md)
for the implemented backend routes.

## D015 — Medicine catalog backend (2026-09-24)

The user requested continuation of the initial plan with catalog/medicine work,
leaving Android aside. [docs/MEDICINE-CATALOG.md](docs/MEDICINE-CATALOG.md) records
this slice's bounded literal search, exact barcode matching, projected details,
read-only runtime grants and synthetic local seed. Retain the existing authenticated
read boundary for all roles; anonymous browsing is not enabled. Browse defaults to
ACTIVE, with explicit status filters and status-bearing detail/lookup for historical
identification. Real data imports, admin writes and clinical interpretation are not
part of this slice.

## D016 — Patient inventory backend (2026-09-24)

The user authorized continuation into the next planned slice. Implement owner-only
PATIENT inventory routes, explicit units/quantities, nullable calendar dates and
thresholds, and transactional mutation/archive audit. See
[docs/PATIENT-INVENTORY.md](docs/PATIENT-INVENTORY.md). Preserve archived rows and
references, serialize edits/archives, and forbid owner/medicine reassignment.
Calendar filters use explicit dates rather than inventing expiry-soon policies.
Each POST creates a distinct batch; generic POST retry deduplication is deferred
and automatic ambiguous retries are not supported. DELETE is idempotent.
Mobile, treatment deductions, reminders and shared/admin editing remain deferred.

## D017 — Manual prescription drafts (2026-09-24)

The user requested continued implementation without routine confirmation prompts.
With Android deferred, proceed into manual prescription drafts and auditable field
revisions. [docs/PRESCRIPTION-DRAFTS.md](docs/PRESCRIPTION-DRAFTS.md) defines the
implemented subset. Preserve USER provenance, unknown null quantities, prior
revisions, stale-edit conflicts and archived history. Verified doctor linking,
file/OCR processing and prescription-level CONFIRMED remain unavailable because
their required policies/providers are still open. No clinical confirmation rules,
OCR output, storage URLs or active treatments are fabricated.

## D018 — Private prescription attachments (2026-09-25)

Continue the authorized backend plan with ordered JPEG/PNG attachments to existing
DRAFT prescriptions and audited owner downloads.
[docs/PRESCRIPTION-DOCUMENTS.md](docs/PRESCRIPTION-DOCUMENTS.md) defines 5 MiB /
20-million-pixel limits, twenty consecutive pages, private S3-compatible storage
and a maximum 60-second bearer URL lifetime. Already-issued byte access remains
valid until expiry; immediate revocation and shared access are not implemented.
The attachment endpoint returns 201/UPLOADED without OCR, leaves manual provenance
unchanged, and never claims QUEUED. Production provider, quotas, lifecycle, malware
scanning and OCR decisions remain open. MinIO is a source-pinned local fixture.

## D019 — Explicit notification preferences (2026-09-25)

Continue the backend plan with the fully specified F14/F15 preference contract
while OCR and treatment policies remain open.
[docs/NOTIFICATION-PREFERENCES.md](docs/NOTIFICATION-PREFERENCES.md) records owner
GET/PATCH for all active account roles, an explicit unconfigured state, required
first-save flags, scoped partial updates and transactional audit. The maximum
lead time is only the PostgreSQL INTEGER representation bound, not a reminder
policy. No defaults, delivery consent, push integration or scheduled alerts are
inferred. No-op saves preserve timestamps and do not duplicate audit.

## D020 — Explicit review and fixed-time treatment backend (2026-09-25)

The user authorized the proposed prescription-review/treatment scheduling phase.
[docs/TREATMENTS.md](docs/TREATMENTS.md) defines the bounded manual daily-review
subset, explicit PLANNED→ACTIVE activation, immutable timezone/schedule snapshots,
DST gap/fold rejection, stable future occurrence generation and idempotent
TAKEN/SKIPPED self-reporting. Unrecorded is not automatically MISSED; no clinical
cutoff, correction dose, stock conversion or provider behavior is invented.
Supersede D017's blanket prohibition on manual prescription-level confirmation
only for the explicit complete-current-field snapshot described there.
Pause/resume, replacement schedules and reminder delivery remain unimplemented.

## D021 — Best-effort dose reminder inbox (2026-09-25)

Continue the authorized reminder phase with a separate BullMQ worker and private
notification inbox. [docs/REMINDERS.md](docs/REMINDERS.md) defines consent/state
rechecks, five-minute operational freshness, bounded retries and durable occurrence
idempotency. This supersedes D020's reminder-delivery limitation only for in-app
inbox records. Device registration, phone push and clinical missed-dose policies
remain open; no delivery provider is inferred.

## D022 — First connected Android client (2026-09-25)

Continue the authorized mobile phase with Expo SDK 57, Expo Router, SecureStore
and English patient screens against existing API contracts. See
[docs/ANDROID.md](docs/ANDROID.md). Keep access tokens in memory, serialize refresh
and discard a consumed token before the network call. No offline medical cache or
automatic retry of dose mutations. The initial small client uses component state;
TanStack Query from D011 remains a later data-layer integration. Push registration
and delivery remain blocked on the user-owned Expo/Firebase configuration and
device verification; no provider credentials are invented.
