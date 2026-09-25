# Saydaliyati — Foundation Decision Record

Date: 2026-09-14  
Status: APPROVED foundation decisions; separate open decisions below  
Source: user-approved reconciliation instructions following the accepted initial audit

Despite the filename `foundation-proposal.md`, F01–F16 record the approved
foundation and the minimal persistence/API contract details the user explicitly
requested this task to define. They are not an unapproved replacement architecture.
Root [DECISIONS.md](../../DECISIONS.md) references this record; root specifications
retain the existing precedence hierarchy and location. No application has been implemented.

The contract details (e.g. archived_at, normalized field revisions, occurrence
uniqueness and endpoint names) specify the requested approved behavior. Open
provider/policy choices below are not silently treated as approved.

## APPROVED DECISIONS

### F01 — Technology foundation

**Decision:** Use pnpm workspaces; strict TypeScript; NestJS REST under /api/v1; PostgreSQL through Prisma; React Native + Expo + Expo Router; TanStack Query; shared Zod schemas and NestJS boundary validation; Redis/BullMQ; MinIO locally and private S3-compatible production storage; Docker Compose, Nginx and HTTPS/TLS. PostgreSQL/Redis stay private.

**Rationale:** Fix the approved stack without introducing a third architecture or duplicating domain rules.

**Affected specifications:** [DECISIONS.md](../../DECISIONS.md), [ARCHITECTURE.md](../../ARCHITECTURE.md), [ERD.md](../../ERD.md), [INFRASTRUCTURE.md](../../INFRASTRUCTURE.md), [DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md), [API-IMPLEMENTATION-RULES.md](../../API-IMPLEMENTATION-RULES.md).

**Implementation consequence:** Later bootstrap chooses mutually compatible currently supported stable versions and pins them in actual manifests/tooling/lockfiles. No historical version numbers are invented here; no provider, admin framework or test runner is selected by implication.

**Verification requirement:** At bootstrap, check official compatibility/support sources, reproducible pnpm installation, strict typecheck and the explicitly scoped tooling checks.

### F02 — Canonical database names

**Decision:** Use medicine_barcodes.barcode_type and medicine_images.image_type. Do not use a generic type column for either concept.

**Rationale:** Keep the database, ORM mapping and API interpretation unambiguous.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md).

**Implementation consequence:** Later Prisma fields may use camelCase mapped to these exact database names; no schema exists yet.

**Verification requirement:** Search the affected table definitions for generic type columns; later verify actual Prisma-to-SQL mappings.

### F03 — Prescription quantity

**Decision:** prescription_medications.quantity is null when unreliable/unknown; a supplied value must be strictly greater than zero. Zero is invalid.

**Rationale:** Unknown quantity must not become a misleading zero.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [PRESCRIPTION-OCR.md](../../PRESCRIPTION-OCR.md).

**Implementation consequence:** Validate positive-or-null values at the boundary and persistence layer. UI blank means unknown, not zero.

**Verification requirement:** Later tests accept null and positive values; reject zero/negative values; verify OCR never substitutes zero for missing quantity.

### F04 — Inventory quantity and units

**Decision:** Inventory always stores medicineId, quantity >= 0 and an explicit controlled inventory_unit. Initial codes are TABLET, CAPSULE, ML, MG, G, DOSE, SACHET, AMPOULE, VIAL, SUPPOSITORY, DROP, PATCH, OTHER. Structured catalog data may suggest a unit for confirmation; neither AI nor free-text strength may infer it.

**Rationale:** Quantity without a unit is ambiguous and unsafe for stock calculations.

**Affected specifications:** [ENUMS.md](../../ENUMS.md), [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md), [DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md), [AI-ARCHITECTURE.md](../../AI-ARCHITECTURE.md).

**Implementation consequence:** Persist canonical codes, localize labels, and require explicit quantity/unit updates. OTHER is not permission to infer a conversion. Complex pharmaceutical conversion and batch allocation are deferred.

**Verification requirement:** Later reject missing/null/unsupported units; verify localized display retains machine codes and mixed units never produce invented stock estimates.

### F05 — Authentication and sessions

**Decision:** Use short-lived access tokens, rotating refresh tokens and server-side revocable sessions. Store only cryptographic hashes/derived verification material for refresh tokens. Mobile persistent credentials use platform secure storage, never ordinary AsyncStorage.

**Rationale:** Server-side revocation and atomic rotation make session lifecycle enforceable independently of the UI.

**Affected specifications:** [ARCHITECTURE.md](../../ARCHITECTURE.md), [DATABASE.md](../../DATABASE.md), [TABLES.md](../../TABLES.md), [ERD.md](../../ERD.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [INDEXES.md](../../INDEXES.md), [MIGRATIONS.md](../../MIGRATIONS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [API-IMPLEMENTATION-RULES.md](../../API-IMPLEMENTATION-RULES.md), [SECURITY.md](../../SECURITY.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md).

**Implementation consequence:** TABLES.md defines sessions fields. Derive actor/session server-side, compare-and-replace refresh verification atomically and honor revocation on protected requests. No OAuth/social login is added. Recovery is explicitly deferred as permitted by the approved instructions.

**Verification requirement:** Later test login/rotation/logout, expired/revoked sessions, concurrent token reuse, account isolation and secure mobile persistence; inspect stored/logged data for plaintext tokens.

### F06 — Inventory archive removal

**Decision:** Remove active inventory by setting archived_at. Preserve the row and clinical/audit references; do not cascade into prescriptions, treatments, medication events or audit records.

**Rationale:** Removing a medicine from the active pharmacy must not destroy historical integrity.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [INDEXES.md](../../INDEXES.md), [API-CONTRACT.md](../../API-CONTRACT.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [PRIVACY-DATA-LIFECYCLE.md](../../PRIVACY-DATA-LIFECYCLE.md), [AUDIT-LOGGING.md](../../AUDIT-LOGGING.md).

**Implementation consequence:** DELETE is an idempotent owner archive action with audit. Current lists/calculations/shared stock exclude archives. Physical purge remains a separately governed lifecycle; no restore UI is added.

**Verification requirement:** Later verify archive invisibility in active views, preserved references, non-cascading behavior, idempotency and cross-patient rejection.

### F07 — ShareSession bootstrap

**Decision:** A six-character code/QR bootstraps access only. Use secure randomness and alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789, hash-only storage, expiry, use/attempt limits and actor/IP rate limiting. Record patient, requested scope, counters and consumed/cancelled times.

**Rationale:** Short codes must not become ongoing credentials; online guessing needs controls beyond per-session counters.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [ENUMS.md](../../ENUMS.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [INDEXES.md](../../INDEXES.md), [MIGRATIONS.md](../../MIGRATIONS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [SHARING.md](../../SHARING.md), [SECURITY.md](../../SECURITY.md).

**Implementation consequence:** Store requested permissions separately. Atomically create grants and increment uses; mark consumed when uses are exhausted. Track unmatched guesses without inventing a session. Exact limits/hash construction remain open before implementation.

**Verification requirement:** Later test alphabet/length, no plaintext persistence, counter limits, concurrent redemption, consumed/cancelled/expired rejection and brute-force controls.

### F08 — AccessGrant authorization

**Decision:** An AccessGrant binds patientId to authenticated recipientUserId and recipientType, copies requested permissions, references sourceShareSessionId, and stores grantedAt, independent nullable expiresAt, revokedAt and revokedBy. Bootstrap expiry/cancellation does not revoke existing grants.

**Rationale:** Permanent authorization context must be recipient-bound, scoped and independently revocable.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [INDEXES.md](../../INDEXES.md), [API-CONTRACT.md](../../API-CONTRACT.md), [SHARING.md](../../SHARING.md), [SECURITY.md](../../SECURITY.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [AUDIT-LOGGING.md](../../AUDIT-LOGGING.md).

**Implementation consequence:** Canonical SQL names use snake_case; API uses camelCase. The patient explicitly approves grant expiry or null at creation (grantExpiresAt). Grant endpoints handle active recipients and revocation; session endpoints handle pending codes/cancellation. Existing connection/audit records are not access authority.

**Verification requirement:** Later verify recipient/patient isolation, independent lifetimes, revoked access failure, immutable permission snapshot, idempotent same-recipient redemption and transactional audit.

### F09 — Permission projections

**Decision:** Keep READ_MEDICATIONS, READ_INVENTORY, READ_EXPIRY, READ_PRESCRIPTIONS, READ_TREATMENTS and READ_HISTORY independent. SHARING.md section 3 defines exact minimal projections, including nested objects.

**Rationale:** Overlapping responses must not silently reveal expiry, history or unrelated health records.

**Affected specifications:** [SHARING.md](../../SHARING.md), [API-CONTRACT.md](../../API-CONTRACT.md), [SECURITY.md](../../SECURITY.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [DESIGN-SYSTEM.md](../../DESIGN-SYSTEM.md), [AI-ARCHITECTURE.md](../../AI-ARCHITECTURE.md).

**Implementation consequence:** Use grantId routes. Inventory omits expiry/batch without READ_EXPIRY; treatments omit event-derived progress without READ_HISTORY. Confirmed prescription access includes authorized original documents with clear consent. No mutations, per-record selector feature or implicit union of grants is added.

**Verification requirement:** Later test every permission alone and in combinations; verify nested field omission, document membership, non-confirmed prescription exclusion and no implicit scope expansion.

### F10 — MVP recipient and feature scope

**Decision:** Only DOCTOR and PHARMACY are V1 sharing recipients. CAREGIVER/FAMILY and community requests/availability remain deferred; retain future design notes without active endpoints, navigation or baseline migration requirements.

**Rationale:** Keep the initial baseline focused and avoid undefined recipient identity or community behavior.

**Affected specifications:** [MASTER-IMPLEMENTATION-SPEC.md](../../MASTER-IMPLEMENTATION-SPEC.md), [ENUMS.md](../../ENUMS.md), [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [MIGRATIONS.md](../../MIGRATIONS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [PRODUCT.md](../../PRODUCT.md), [ROLE-SPECIFICATIONS.md](../../ROLE-SPECIFICATIONS.md), [SHARING.md](../../SHARING.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [SCREENS.md](../../SCREENS.md), [ROADMAP.md](../../ROADMAP.md).

**Implementation consequence:** Future independent trusted connections are not required to authorize MVP grants. Professional provisioning/verification policy is still required before the sharing slice.

**Verification requirement:** Later reject unsupported recipient types; verify future endpoints/tables/options are absent from the V1 implementation.

### F11 — OCR processing and business states

**Decision:** OCR processing states: UPLOADED, QUEUED, PROCESSING, REVIEW_REQUIRED, COMPLETED, FAILED. Prescription business states: DRAFT, CONFIRMED, ARCHIVED. Manual entry has no OCR job/state.

**Rationale:** Worker progress is different from the user confirming prescription information.

**Affected specifications:** [ENUMS.md](../../ENUMS.md), [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [API-CONTRACT.md](../../API-CONTRACT.md), [PRESCRIPTION-OCR.md](../../PRESCRIPTION-OCR.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md).

**Implementation consequence:** Use separate status and processingStatus fields. Scan returns accepted asynchronous work; detail supports polling. Completed explicit review can mark OCR completed and prescription confirmed, never treatment active.

**Verification requirement:** Later verify separate transitions, failure visibility, manual null processing state and no automatic treatment activation.

### F12 — Field provenance and prescription documents

**Decision:** Persist normalized append-only field revisions with value, nullable confidence, source (OCR/AI/USER/PROFESSIONAL), confirmation actor/time and revision. Use a one-to-many ordered prescription_documents relationship with ownership, private storage key, MIME, processing and retention metadata.

**Rationale:** Field-level review must preserve original uncertainty and multi-page source evidence.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [INDEXES.md](../../INDEXES.md), [MIGRATIONS.md](../../MIGRATIONS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [PRESCRIPTION-OCR.md](../../PRESCRIPTION-OCR.md), [SECURITY.md](../../SECURITY.md), [PRIVACY-DATA-LIFECYCLE.md](../../PRIVACY-DATA-LIFECYCLE.md), [AUDIT-LOGGING.md](../../AUDIT-LOGGING.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md).

**Implementation consequence:** TABLES.md section 32 defines the minimal persistence contract. Append edits/confirmations; medication scalars are synchronized projections. Authorize owner or confirmed-prescription grant before signed URL issuance. No public files or invented handwriting values.

**Verification requirement:** Later test revision retention, stale review rejection, confirmation requirements, page ordering, MIME validation, cross-patient references/downloads and revoked-grant URL issuance.

### F13 — Fixed-time schedules and occurrence identity

**Decision:** V1 supports FIXED_TIMES only. Capture a validated IANA timezone from the patient profile. A schedule row defines one daily time; materialize stable occurrence UUIDs with unique(schedule_id, local_date). Events reference a unique occurrence_id.

**Rationale:** Retries and timezone formatting must not generate duplicate dose outcomes.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [ENUMS.md](../../ENUMS.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [INDEXES.md](../../INDEXES.md), [MIGRATIONS.md](../../MIGRATIONS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [NOTIFICATIONS.md](../../NOTIFICATIONS.md).

**Implementation consequence:** Immutable historical schedule identity and future-effective replacement preserve occurrences. Identical retries return the existing event; conflicting outcomes return MEDICATION_EVENT_CONFLICT. Never rely solely on scheduledAt equality. DST and edit policies remain gates before treatment work.

**Verification requirement:** Later test concurrent duplicate requests, same-occurrence conflicts, wrong-patient occurrences, schedule replacement and approved timezone/DST behavior.

### F14 — Notification persistence

**Decision:** notification_preferences is required for MVP: explicit dose, expiry, low-stock, sharing and system flags, with nullable expiry lead time. A per-inventory nullable threshold uses that record’s explicit unit. Device registration is separate; production push provider remains unselected.

**Rationale:** User settings cannot be an ephemeral UI state or an inferred cross-unit threshold.

**Affected specifications:** [DATABASE.md](../../DATABASE.md), [ERD.md](../../ERD.md), [TABLES.md](../../TABLES.md), [CONSTRAINTS.md](../../CONSTRAINTS.md), [MIGRATIONS.md](../../MIGRATIONS.md), [API-CONTRACT.md](../../API-CONTRACT.md), [NOTIFICATIONS.md](../../NOTIFICATIONS.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md).

**Implementation consequence:** GET/PATCH preference contracts expose unconfigured state instead of fabricated defaults. No preference-controlled delivery until settings are recorded. Decide push-token registration/protection before notification integration.

**Verification requirement:** Later verify persistence, owner scope, first-save explicit flags, unit-specific thresholds, archive exclusion and occurrence-based delivery deduplication.

### F15 — Canonical APIs and errors

**Decision:** API-CONTRACT.md section 20 owns the error vocabulary. Add minimum patient profile GET/PATCH, event GET, notification preference GET/PATCH, and recipient-bound grant listing/detail/revocation/shared-resource contracts. Recovery is explicitly deferred.

**Rationale:** Screens must use defined endpoints and one stable machine-readable error contract.

**Affected specifications:** [API-CONTRACT.md](../../API-CONTRACT.md), [API-IMPLEMENTATION-RULES.md](../../API-IMPLEMENTATION-RULES.md), [API.md](../../API.md), [SCREEN-SPECIFICATION.md](../../SCREEN-SPECIFICATION.md), [USER-JOURNEYS.md](../../USER-JOURNEYS.md).

**Implementation consequence:** Use safe response/error envelopes and allowlisted inputs; no stack traces/provider errors. Do not introduce broad admin APIs, OAuth or unsupported recovery/professional profile mutations.

**Verification requirement:** Later verify OpenAPI and contract tests, required ownership checks, pagination, error names, recursive field projections and UI/API traceability.

### F16 — Documentation authority and task scope

**Decision:** Root-level Markdown specifications stay authoritative. This record under docs/decisions/ records accepted foundation decisions despite its proposal filename. Preserve the historical astra_audit.md. Reconcile package metadata/checksums without implementing the application.

**Rationale:** Keep the accepted product contract distinct from the historical audit and from future implementation work.

**Affected specifications:** [MASTER-IMPLEMENTATION-SPEC.md](../../MASTER-IMPLEMENTATION-SPEC.md), [DECISIONS.md](../../DECISIONS.md), [DEVELOPMENT-RULES.md](../../DEVELOPMENT-RULES.md), [CODEX-EXECUTION-PLAN.md](../../CODEX-EXECUTION-PLAN.md), [README.md](../../README.md).

**Implementation consequence:** No package.json, workspace YAML, applications, Prisma schema/migrations, Docker, CI, installs or commits are created in this task. Prompt #3 is a separate minimal tooling bootstrap.

**Verification requirement:** Verify links, state/error vocabulary, stale references, Markdown/JSON integrity, original asset/audit hashes, package inventory and all SHA-256 entries; confirm no source/config files were created.

## DEFERRED / OPEN DECISIONS

### Before minimal bootstrap

- Select and pin mutually compatible, currently supported stable toolchain versions
  using official documentation during Prompt #3. No specific versions are approved here.
- Keep bootstrap scope explicit. Test/lint tooling choices should be limited to
  what the next prompt authorizes; admin framework and production providers are not
  prerequisites for a workspace scaffold.

### Before authentication / first inventory slice

- Password/refresh algorithms, token encoding, TTLs, replay and rate budgets are
  now resolved for the backend by D014 and [authentication.md](authentication.md).
  Required foundation properties remain fixed.
- Identity verification requirements and recovery delivery/reset contract. Recovery
  is deferred, not implemented or represented as a working screen.
- Detailed retention/purge policy and account deletion. Archive behavior is approved.
- No complex unit conversion: calculations must remain explicitly same-unit or
  report insufficient structured information.

### Before sharing and professional workflows

- Bootstrap TTL/attempt/use configuration, safe code-hash lookup/collision strategy,
  lifetime presets and whether a multi-use UI is needed. No silent indefinite grants.
- Professional provisioning/verification evidence and operational workflow. Do not
  infer verification solely from a selected role. No broad admin APIs are approved.
- Signed URL TTL and whether stronger revocation of already-issued byte access is
  necessary. Grant revocation blocks future API authorization, not downloaded copies.

### Before OCR, treatment and notification slices

- OCR/vision provider, accepted file limits/formats, field requirements per regimen,
  retry/reprocessing policy and retention periods. Sources and provenance contract
  are fixed; no guesswork for uncertain fields.
- DST gap/fold behavior, travel/profile-timezone effects on future schedules,
  retrospective schedule edits and missed-dose cutoff. Stable identity and captured
  timezone are fixed; ambiguous occurrences must not be silently resolved.
- Initial preference defaults, expiry lead-time bounds, notification retry policy,
  device token registration/protection and production push provider. No implicit
  consent or global mixed-unit threshold.
- Catalog source licensing, import approval details, AI/provider terms, audit retention,
  operational controls and jurisdiction-specific review before relevant production use.

### Explicitly deferred features

Caregiver/family access; community medication availability/requests; independent
trusted-connection workflows; INTERVAL/AS_NEEDED schedules; complex pharmaceutical
unit conversion and automatic batch accounting; OAuth/social login; undefined
password recovery; broad admin APIs beyond existing future feature specifications.

## Verification gates for this documentation task

1. Root specs use canonical names, positive-or-null prescription quantity, and
   explicit inventory units/archive semantics.
2. Session tokens are hashed; mobile secure storage is explicit.
3. Session/code lifecycle cannot authorize ongoing grant reads. Grant and bootstrap
   expiry/cancellation/revocation are distinct in database, API, UX and audit.
4. Field projections prevent expiry/history leakage; future recipients are excluded.
5. OCR/business enums are separate; multi-page ownership and review history exist.
6. Fixed-time occurrence uniqueness, event GET/POST, profiles and preference APIs align.
7. Root documents remain in place; original audit is historical and unchanged.
8. Manifest inventory and SHA-256 checksums cover the reconciled package.

These are documentation checks, not claims that runtime security or tests pass.

## Proposed Prompt #3 scope — not executed

Bootstrap only the minimal pnpm workspace/tooling foundation. Re-read this record
and root specs. Verify current stable compatibility and pin actual tool versions.
Create root package/workspace configuration, strict shared TypeScript settings,
minimal formatting/lint/check commands and only the package metadata/documentation
needed to verify workspace discovery. Keep applications and feature packages for
subsequent explicitly scoped tasks; avoid mass dependency installation.

Do not create database schema/tables/migrations, initialize the application stack,
implement auth/catalog/inventory or UI, integrate providers, create deployment/CI,
import data or commit unless the actual next prompt explicitly authorizes it.
Verify the permitted scaffold and report exact checks and remaining prerequisites.

### Subsequent private-document decision

D018 and [../PRESCRIPTION-DOCUMENTS.md](../PRESCRIPTION-DOCUMENTS.md) resolve the
owner attachment limits and maximum 60-second signed URL lifetime. Issued bearer
links remain valid until expiry; immediate byte revocation and shared-recipient
issuance are not implemented. OCR, production provider and lifecycle policies
remain open.

### Subsequent manual treatment decision

D020 and [../TREATMENTS.md](../TREATMENTS.md) define the bounded manual daily-review
subset, explicit activation, captured timezones, DST gap/fold rejection and
idempotent TAKEN/SKIPPED events. No automatic MISSED cutoff is chosen. Advanced
regimen types, schedule replacements, OCR and notification delivery remain open.
