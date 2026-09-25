# Saydaliyati --- TESTING.md

Version: 1.0

## 1. Testing pyramid

``` text
Unit
 ↓
Integration
 ↓
API
 ↓
Security
 ↓
E2E
 ↓
Mobile E2E
```

## 2. Unit tests

Required for:

-   stock calculations
-   treatment progress
-   schedule generation
-   expiry logic
-   confidence thresholds
-   share-code generation/verification
-   permission evaluation
-   localization helpers

## 3. Database tests

Verify:

-   constraints
-   indexes where behavior depends on uniqueness
-   ownership boundaries
-   migration correctness
-   transaction behavior

## 4. API tests

Every protected endpoint needs:

``` text
authorized owner
authorized shared recipient
unauthorized user
wrong role
missing resource
invalid input
```

## 5. Security tests

Priority:

1.  cross-patient access
2.  share-code brute force
3.  expired code
4.  revoked share
5.  max-use enforcement
6.  privilege escalation
7.  file authorization
8.  malicious uploads
9.  token/session abuse
10. AI tool authorization

## 6. AI tests

Create a regression dataset containing:

-   normal medication questions
-   missing data
-   contradictory data
-   prompt injection
-   unsupported medical advice
-   Arabic
-   French
-   English
-   cross-patient context attempts

## 7. OCR tests

Use anonymized test fixtures.

Measure:

-   medicine recognition accuracy
-   strength accuracy
-   frequency accuracy
-   duration accuracy
-   field-level confidence

## 8. Mobile E2E

Critical flows:

``` text
register → home
scan → confirm → inventory
prescription → review → treatment
treatment → mark taken
share → redeem → revoke
AI → tool → response
```

## 9. Regression

Every production bug should become a regression test where practical.

## 10. Definition of Done

A feature is not complete when it merely works manually.

It must include appropriate automated tests.

## 11. Approved foundation contract regressions

- Session hash-only persistence, secure mobile storage, rotation concurrency,
  expiration/revocation and account-scoped cache cleanup.
- Explicit inventory units, positive-or-null prescription quantity, archived
  inventory exclusions and preserved clinical/audit references.
- Separate code/grant lifetimes; expiry/cancellation stops new redemption while
  valid grants continue. Grant revocation blocks later reads and URL issuance.
- Concurrent/max-use/attempt-limited redemption and same-recipient retries.
- Each permission alone and combined, including nested expiry/history omission.
- Private ordered document ownership, field revision retention and confirmation,
  independent OCR/business states and no automatic treatment activation.
- Unique fixed-time occurrence/event recording under concurrent retries;
  conflicting outcomes fail without altering history.
- Profile/preference ownership, unconfigured notification settings and same-unit
  thresholds. Shared recipients use grant routes; /me patient routes remain owner-only.

The regressions above are acceptance requirements for their respective feature
slices. Deferred workflows must not appear as supported V1 routes, UI options or
baseline migration dependencies.

## 12. Implemented foundation tests

`pnpm test` runs API/configuration/cryptographic tests. `pnpm test:integration`
checks database constraints, runtime privileges, owner-only profiles, credentials,
expiry, concurrent refresh/replay, logout, audit rollback and Redis abuse controls.
Tests use Node's built-in runner and dedicated local test databases. See
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for authentication setup and scope. Catalog tests also cover Unicode/literal search,
pagination, exact barcodes, status visibility, read-only privileges and repeatable
synthetic seeding; see [docs/MEDICINE-CATALOG.md](docs/MEDICINE-CATALOG.md).
Patient inventory coverage adds owner/role isolation, explicit unit and decimal/date
validation, expiry/low-stock filters, archive races, database privileges and audit
rollback; see [docs/PATIENT-INVENTORY.md](docs/PATIENT-INVENTORY.md).
API integration files run serially because audit rollback tests temporarily change
shared test-role privileges. Manual prescription tests cover USER revisions,
unknown quantities, stale/concurrent reviews, rejected lines, archive preservation,
document ownership/projection, restricted grants and transactional audit rollback.
Mobile, OCR, prescription-level confirmation, treatments and sharing remain
unimplemented; no end-to-end claims are made for those workflows.

## Private document integration tests

Run `pnpm setup:local`, `pnpm storage:up` and `pnpm storage:init` before the full
integration suite. Document tests use real local MinIO in a separate test bucket,
with synthetic original images, isolated users and scoped object cleanup. They
cover signature TTL, anonymous denial, exact bytes, patient/parent isolation,
page ordering, file limits, archival, lifecycle, restricted grants and audit
rollback cleanup. See docs/PRESCRIPTION-DOCUMENTS.md.

Notification preference tests cover explicit first-save consent, null/zero lead
time, owner isolation for every account role, concurrent initialization/partial
edits, unchanged-save idempotence, audit rollback and database constraints/grants.
They do not send notifications or call a delivery provider.

Treatment verification covers explicit current-field confirmation, exact reviewed
transcription, DST folds/gaps/offset changes, timezone capture, activation/event
concurrency, late self-recording versus future denial, immutable event conflicts,
terminal states, scoped SQL constraints and audit rollback. No test sends a
notification or interprets synthetic test dosing as medical guidance.

### Reminder worker and inbox

`apps/api/test/reminders.integration.mjs` exercises real BullMQ delivery with
isolated test queues, concurrent durable deduplication, stale/future suppression,
consent and account state checks, localization, inbox ownership/read idempotency,
audit rollback and restricted database grants. Only synthetic local inbox records
are generated; no push provider is called.

### Mobile client

The mobile workspace tests serialized refresh, ambiguous failures, session clearing
and endpoint policy. Its guarded real-API integration covers registration, session
restoration, profile, catalog, inbox, preferences and logout with synthetic data.
See docs/ANDROID.md for commands and native/device acceptance gaps.
