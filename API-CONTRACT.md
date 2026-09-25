# Saydaliyati --- API Contract Specification

Version: 1.0\
Status: Implementation baseline\
Base URL: `/api/v1`

## Implemented operational endpoints

`GET /health/live` returns 200 with `{"data":{"status":"ok"},"meta":{}}`.
`GET /health/ready` returns the same envelope with status `ready` when PostgreSQL
is reachable and the initial identity tables exist, or SERVICE_UNAVAILABLE (503)
with empty details. Both are unauthenticated operational probes, use no-store,
and expose no patient data or internal infrastructure details. All paths use
the base URL above. The generated implemented contract is
[docs/api.openapi.json](docs/api.openapi.json).

Authentication and GET/PATCH /me/profile are implemented as documented in
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md). Other product endpoints remain
specifications. Readiness also requires the audit table and Redis; liveness remains
dependency-independent.

------------------------------------------------------------------------

# 1. API Principles

The API is the only application boundary between mobile clients and
PostgreSQL.

``` text
Mobile
  ↓ HTTPS
API
  ↓
Domain Services
  ↓
Repositories
  ↓
PostgreSQL
```

Never:

``` text
Mobile → PostgreSQL
AI → PostgreSQL
AI → arbitrary SQL
```

## Standard response

``` json
{
  "data": {},
  "meta": {}
}
```

## Standard error

``` json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Do not expose stack traces or database errors in production.

------------------------------------------------------------------------

# 2. Authentication

## POST /auth/register

Create a patient account.

### Request

``` json
{
  "email": "user@example.com",
  "phone": "+213555000000",
  "password": "strong-password",
  "firstName": "Imane",
  "lastName": "Example",
  "preferredLanguage": "EN",
  "timezone": "Africa/Algiers"
}
```

At least one supported authentication identifier is required.

### Response

``` json
{
  "data": {
    "user": {
      "id": "uuid",
      "role": "PATIENT"
    },
    "accessToken": "token",
    "refreshToken": "token"
  }
}
```

Registration/login create a server-side Session and return short-lived access
and rotating refresh tokens. Persist only refresh-token verification hashes.
The mobile app stores persistent credentials in platform secure storage, never
ordinary AsyncStorage. Password hashing uses Argon2id. The implemented policy is in
[docs/decisions/authentication.md](docs/decisions/authentication.md): passwords are
15–128 Unicode characters, access JWTs last at most 10 minutes and sessions have an
absolute 30-day lifetime. Registration creates PATIENT/ACTIVE; verification timestamps
remain null. Duplicate identities return generic VALIDATION_ERROR without naming a field.

------------------------------------------------------------------------

## POST /auth/login

### Request

``` json
{
  "identifier": "user@example.com",
  "password": "strong-password"
}
```

### Errors

``` text
AUTH_INVALID_CREDENTIALS
AUTH_ACCOUNT_DISABLED
AUTH_ACCOUNT_SUSPENDED
RATE_LIMITED
```

------------------------------------------------------------------------

## POST /auth/refresh

Request: `{"refreshToken":"opaque-token"}`. Return the standard data envelope with
new accessToken and refreshToken after atomically verifying an active, unexpired
Session and replacing its stored refresh-token hash. An old token cannot be used
twice, including concurrent requests. Derive user and session from verified token
context; do not accept client ownership claims. Never log token material.

Return AUTH_SESSION_EXPIRED or AUTH_SESSION_REVOKED when the verified session
has that state; invalid credentials return AUTH_INVALID_CREDENTIALS. Exact token
format, TTLs and replay behavior are defined in D014. Authentic previous-token reuse
revokes its session transactionally; fabricated signatures cannot revoke a session.
Clients serialize refreshes. Concurrent reuse has one rotation winner followed by
session revocation. Login/register return user/accessToken/refreshToken in data and
empty meta; refresh returns only the replacement token pair in data and empty meta.
Login/refresh/logout return 200 and registration returns 201. Logout accepts an
empty or absent body and requires an unexpired bearer token for idempotent retries.

------------------------------------------------------------------------

## POST /auth/logout

Authenticate the current session and set its revoked_at. Return `{"data":{},"meta":{}}`.
Repeated logout for the same validly identified session is idempotent. Subsequent
refresh/protected access must honor revocation. Mobile deletes stored credentials
and clears account-scoped caches; do not use UI-only logout.

## Recovery — deferred

Forgot-password/password recovery is not defined for this baseline. Do not expose
an actionable recovery screen or invent a reset-token flow. Recovery delivery,
verification, anti-enumeration behavior and retention require approval before
implementation; assess this limitation before a public release.

## GET /me/profile

Authenticated patient profile used by Splash, Home and Profile. Return
`data: {firstName, lastName, preferredLanguage, timezone, email, phone}` and meta.
Email/phone are read-only account information in this contract. No hashes,
credentials, internal session data or another patient's profile are returned.

## PATCH /me/profile

Authenticated patient; allow partial updates only to firstName, lastName,
preferredLanguage (EN/FR/AR) and timezone (valid IANA identifier). Reject unknown
fields and ownerId/userId/patientId, role and verification changes. Return the same
profile projection. Names must be nonempty within database length limits.
Changes to timezone do not silently reschedule existing treatments. Professional
profile editing and identifier changes remain outside this minimal patient contract.

------------------------------------------------------------------------

# 3. Authentication Headers

Protected requests:

``` http
Authorization: Bearer <access-token>
```

The server derives the authenticated user from the token.

Never trust a client-supplied `userId` or `patientId` for ownership.

------------------------------------------------------------------------

# 4. Medicines

The implemented catalog routes require a valid authenticated session. All four
roles have read access; anonymous browsing is not enabled. Catalog mutation and
real-data import remain separate admin work. See
[docs/MEDICINE-CATALOG.md](docs/MEDICINE-CATALOG.md) for the implemented contract.

## GET /medicines

Search/browse medicines. Defaults: page=1, limit=20, status=ACTIVE. Maximum
page=10000 and limit=100. Ingredient/manufacturer filters are UUIDs; status accepts
ACTIVE, INACTIVE or ARCHIVED. Reject unknown filters, repeated query values and
blank q. Search q (maximum 200 characters) is a literal case-insensitive substring
across normalized name, brand, generic name and ingredient name, preserving accents
and Arabic. Sort by normalized name then UUID. Return meta.totalPages in addition
to page/limit/total, using a consistent database snapshot.

### Query

``` text
q
page
limit
ingredient
manufacturer
status
```

Example:

``` http
GET /api/v1/medicines?q=amoxicilline&page=1&limit=20
```

### Response

``` json
{
  "data": [
    {
      "id": "uuid",
      "name": "Amoxicilline 500 mg",
      "brandName": "Example",
      "genericName": "Amoxicillin",
      "strength": "500 mg",
      "dosageForm": "Capsule",
      "manufacturer": {
        "id": "uuid",
        "name": "Example Pharma"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

------------------------------------------------------------------------

## GET /medicines/:id

Returns the canonical medicine record for any status, with an explicit status
field. Unknown UUIDs return RESOURCE_NOT_FOUND; malformed UUIDs return VALIDATION_ERROR.
Ingredient amounts serialize as decimal strings or null; no dose is inferred.

Include:

-   name
-   brand
-   generic
-   strength
-   form
-   route
-   package size
-   ingredients
-   manufacturer
-   images
-   barcodes where appropriate
-   source/provenance where appropriate

Do not expose internal administrative metadata unnecessarily.

------------------------------------------------------------------------

## GET /medicines/barcode/:barcode

Exact barcode lookup, returning the same canonical detail as the UUID route,
including inactive/archived status. Trim outer whitespace and require 1–100 printable
non-space ASCII characters, preserving case and leading zeros. No QR payload
interpretation, URL fetching, UPC/EAN conversion or inventory mutation occurs.

### Errors

``` text
RESOURCE_NOT_FOUND
VALIDATION_ERROR
```

------------------------------------------------------------------------

## GET /medicines/search

Optional dedicated search endpoint if search behavior becomes
sufficiently different from browse.

------------------------------------------------------------------------

## POST /medicines/identify

Starts medicine identification from image/barcode input.

This endpoint does not silently create a medicine or inventory record.

### Request concept

Multipart upload or secure file reference:

``` text
image
barcode optional
```

### Response

``` json
{
  "data": {
    "status": "REVIEW_REQUIRED",
    "candidates": [
      {
        "medicineId": "uuid",
        "confidence": 0.96,
        "matchReasons": [
          "BARCODE_MATCH",
          "NAME_MATCH"
        ]
      }
    ],
    "extracted": {
      "name": "Amoxicilline",
      "strength": "500 mg"
    }
  }
}
```

The client must require user confirmation before adding inventory.

------------------------------------------------------------------------

# 5. Patient Inventory

The implemented inventory endpoints require an active PATIENT session and owner
scope. DOCTOR/PHARMACY/ADMIN have no bypass through /me routes. Read
[docs/PATIENT-INVENTORY.md](docs/PATIENT-INVENTORY.md) for the implemented details.
Quantity/threshold inputs are JSON numbers (0–999999999.999, up to three decimal
places); output uses exact decimal strings. Optional fields can be explicitly null.
Date values are valid YYYY-MM-DD strings in years 0001–9999, never timestamps.

## GET /me/inventory

### Query

``` text
q
status
expiryBefore
lowStock
medicineId
page
limit
sort
```

Example:

``` http
GET /api/v1/me/inventory?expiryBefore=2026-10-01
```

Implemented semantics: page defaults to 1 (maximum 10000), limit to 20 (maximum
100), sort to created_desc. Supported sorts are created_desc, name_asc and
expiry_asc (unknown expiry last); UUID ascending breaks ties. All filters intersect.
q searches literal medicine name/brand/generic name or batch text (maximum 200
characters). status accepts only ACTIVE, meaning unarchived inventory. expiryBefore
is an exclusive date cutoff. lowStock=true compares quantity <= the record's
explicit threshold; false also includes unset thresholds. No default threshold
or relative expiry window is inferred. Rows and totals use one consistent snapshot.

------------------------------------------------------------------------

## POST /me/inventory

Add a medicine to the patient's inventory. Every POST creates a separate row;
no duplicate-batch merging or generic request-idempotency storage is implemented.
Clients must not automatically retry an ambiguous POST. Existing medicines of any
catalog status can be recorded; the nested medicine status remains explicit.

### Request

``` json
{
  "medicineId": "uuid",
  "quantity": 30,
  "unit": "CAPSULE",
  "batchNumber": "ABC123",
  "expiryDate": "2027-05-31",
  "purchaseDate": "2026-09-10",
  "storageLocation": "Home",
  "source": "SCAN",
  "notes": "..."
}
```

### Validation

-   medicine must exist
-   quantity \>= 0
-   unit is required and must be an inventory_unit code from ENUMS.md
-   missing/null/unknown unit is invalid; never infer from AI or free-text strength
-   expiry date valid
-   ownership derived from authenticated user

------------------------------------------------------------------------

## GET /me/inventory/:id

Returns one inventory record.

Cross-patient access must return:

``` text
RESOURCE_NOT_FOUND
```

or another intentionally non-disclosing response rather than confirming
the resource exists.

------------------------------------------------------------------------

## PATCH /me/inventory/:id

Update patient-owned inventory.

The client must not change patientId or archivedAt. Mutable fields are quantity,
unit, batchNumber, expiryDate, purchaseDate, storageLocation, source, notes, and
lowStockThreshold (nullable nonnegative number in the same explicit inventory unit).
Batch/storage/notes limits are 100/150/4000 characters. Omitted fields are preserved;
null clears nullable fields. Empty edits and unexpected fields are rejected.
Changing unit is an explicit user edit, never a conversion. Require an explicit
quantity and threshold reset/reconfirmation with a unit change; do not reinterpret
an existing threshold silently. POST also accepts optional lowStockThreshold.

------------------------------------------------------------------------

## DELETE /me/inventory/:id

Archive the owner’s inventory row by setting archived_at; return the standard
success envelope. Repeated owner removal is idempotent. Never physically delete
or cascade into prescriptions, treatments, medication events or audit. Record
the archive action transactionally. Wrong-owner IDs return RESOURCE_NOT_FOUND.

Default GET lists, low-stock/expiry calculations and shared current inventory
exclude archived rows. GET/PATCH of an archived row through current-inventory
routes returns RESOURCE_NOT_FOUND. Historical references remain internally valid.
A restore/history UI or physical purge is not introduced by this contract.

------------------------------------------------------------------------

# 6. Prescriptions

**Current implementation:** manual owner DRAFT creation/list/detail, append-only
field reviews/rejections and archive are implemented. Prescription-level CONFIRMED,
non-null doctorId linking, scan and OCR remain unavailable. Manual review confirmation
and fixed-time treatments are now available under D020 (docs/TREATMENTS.md). Ordered attachments
and owner downloads are implemented as specified in docs/PRESCRIPTION-DOCUMENTS.md. The
full target scan/review contract below is retained for the later file/OCR slice;
see [docs/PRESCRIPTION-DRAFTS.md](docs/PRESCRIPTION-DRAFTS.md) for the exact boundary.

## GET /me/prescriptions

List current patient's prescriptions. Defaults: page=1, limit=20, maximums
10000/100. Optional status is DRAFT/CONFIRMED/ARCHIVED; default excludes archives.
Sort by createdAt descending then UUID ascending. Return medicationCount and
consistent pagination metadata without full medication instructions.

------------------------------------------------------------------------

## POST /me/prescriptions

Create a manually entered prescription in DRAFT business state, processingStatus
null. Quantity for each prescription medication must be null or > 0; zero is
invalid and unreliable/unknown quantity remains null. Manual fields have USER
provenance; explicit confirmation is still required before using a prescription
as confirmed treatment input.

The full target request below includes doctorId; the current draft slice requires
it omitted or null until verified professional profiles exist. Current inputs are
bounded to 1–50 medication lines and reject client-selected provenance/status.

### Request

``` json
{
  "doctorId": "uuid",
  "prescriptionDate": "2026-09-12",
  "validUntil": "2026-10-12",
  "source": "MANUAL",
  "medications": [
    {
      "medicineId": "uuid",
      "dosage": 500,
      "dosageUnit": "mg",
      "duration": 7,
      "durationUnit": "DAY",
      "quantity": 21,
      "instructions": "Take after food"
    }
  ]
}
```

------------------------------------------------------------------------

# 7. Prescription Scanning

## POST /me/prescriptions/scan

Authenticated owner uploads one or more ordered images/pages. Validate all files,
MIME signatures, sizes and ordering; persist private prescription_documents and
create a DRAFT prescription. Queue OCR using BullMQ. Persist UPLOADED before
queueing; return HTTP 202 only once processing is accepted as QUEUED.

```json
{
  "data": {
    "prescriptionId": "uuid",
    "status": "DRAFT",
    "processingStatus": "QUEUED",
    "documents": [{"id": "document-uuid", "pageNumber": 1}]
  },
  "meta": {}
}
```

GET /me/prescriptions/:id is the polling contract. Return status and
processingStatus separately, ordered document metadata, and field review data
when ready. Processing states: UPLOADED, QUEUED, PROCESSING, REVIEW_REQUIRED,
COMPLETED, FAILED. Manual entry has processingStatus null. A failed required page
must not be silently discarded. Provider failure exposes PROCESSING_FAILED with
safe text, never provider internals. Retry/reprocessing details remain a later
OCR task and may not silently overwrite reviewed fields.

Example review field (inside a medication's fields array):

```json
{
  "id": "field-revision-uuid",
  "fieldName": "quantity",
  "value": null,
  "confidence": null,
  "source": "OCR",
  "confirmed": false,
  "revision": 1
}
```

## PATCH /me/prescriptions/:id

Owner-only review accepts `fieldReviews: [{fieldId, value, confirmed}]`, optional
`rejectedMedicationIds`, and optional business `status: CONFIRMED` or `ARCHIVED`.
Validate IDs and types, and reject stale field IDs with PRESCRIPTION_REVIEW_CONFLICT.
Server records source, confidence, revision, confirmedBy and confirmedAt; clients
cannot assign provenance or actor identity. Changed values append USER revisions;
a confirmation without changing a value retains its source. Previous revisions
remain auditable. Reject unsafe quantity and do not guess missing dosage.

Reject confirmation until required fields of retained medication lines are
reviewed. Rejected lines remain in history and cannot become treatment input.
Commit field revisions, synchronized medication summaries, prescription state
and audit together. Completed scanned review sets processingStatus COMPLETED;
manual review leaves processingStatus null. Neither transition activates treatment.
D020 defines the supported manual daily-regimen field set in docs/TREATMENTS.md.
Finalization is a standalone status=CONFIRMED request with confirmationFieldIds
for every current retained-line field. Every field is explicitly reviewed and
required dose, medicine, unit, times and dates are present. Other regimen types
and scanned confirmation remain unavailable.
Field confirmation alone never promotes a prescription. Archive preserves history;
owner detail and explicitly filtered lists can still read archived prescriptions.

## GET /me/prescriptions/:id

Owner-only detail: business state, independent processing state, structured
medications with field review/provenance, and ordered document metadata. Do not
return storage keys or publicly accessible document URLs. A shared recipient uses
the grant-scoped route and receives confirmed projections only.

## POST /me/prescriptions/:id/documents (implemented attachment subset)

Multipart `file` plus `pageNumber` appends one original JPEG/PNG to an owner DRAFT.
Maximum 5 MiB, 20 million decoded pixels, twenty consecutive pages. Returns 201
with document id/pageNumber/mimeType/processingStatus=UPLOADED, without queueing
OCR or changing manual provenance. Duplicate/skipped pages and non-DRAFT parents
return DOCUMENT_CONFLICT (409). See D018 and docs/PRESCRIPTION-DOCUMENTS.md for
concurrency, retries, storage configuration, audit and lifecycle boundaries.

## GET /me/prescriptions/:id/documents/:documentId/download

Implemented owner subset uses a maximum 60-second URL lifetime, bounded by a
non-null retention deadline. Already-issued links remain bearer capabilities
until expiry. No shared download implementation is implied.

Authorize parent ownership and document membership on every request. For a
non-deleted document, return `data: {url, expiresAt}` with a newly signed,
short-lived private-storage URL; use a non-cacheable response and audit issuance.
Never expose another patient's document through a valid prescription ID.

## DELETE /me/prescriptions/:id

Archive the business record according to lifecycle policy; preserve treatment,
field-review and audit history. Archiving is not physical deletion of documents.
Retention/purge durations remain open before production.

------------------------------------------------------------------------

# 8. Treatments

## GET /me/treatments

Query:

``` text
status
active
from
to
page
limit
```

------------------------------------------------------------------------

## POST /me/treatments

Implemented D020 subset requires explicit endDate, FIXED_TIMES and weekday arrays;
frequency/frequencyUnit are omitted because explicit schedules are authoritative.
Creation returns PLANNED; activation is a separate PATCH. Maximum 366 days and
5000 occurrences. See docs/TREATMENTS.md for ownership, exact reviewed
transcription, DST rejection and unsupported advanced scheduling.

Create a treatment.

### Request

``` json
{
  "prescriptionId": "uuid",
  "name": "Amoxicilline course",
  "startDate": "2026-09-12",
  "endDate": "2026-09-18",
  "medications": [
    {
      "medicineId": "uuid",
      "dose": 500,
      "doseUnit": "mg",
      "scheduleType": "FIXED_TIMES",
      "instructions": "Take after food",
      "schedules": [
        {
          "time": "08:00",
          "daysOfWeek": [0,1,2,3,4,5,6],
          "startDate": "2026-09-12",
          "endDate": "2026-09-18"
        }
      ]
    }
  ]
}
```

Server must validate:

-   medicine exists
-   patient owns referenced prescription
-   dates are valid
-   dose is positive
-   schedule is valid and scheduleType is FIXED_TIMES (V1 only)
-   schedule timezone is captured from the patient profile
-   a referenced prescription is CONFIRMED; no silent treatment activation

------------------------------------------------------------------------

## GET /me/treatments/:id

Returns:

-   treatment
-   medications
-   schedules
-   today's dose state and eligible occurrences (occurrenceId, localDate, timezone, scheduledAt)
-   progress summary
-   relevant inventory availability

------------------------------------------------------------------------

## PATCH /me/treatments/:id

Implemented subset: status ACTIVE, COMPLETED or CANCELLED only. No timing,
medication or historical edits. See docs/TREATMENTS.md for transitions.

Update treatment state/details.

Do not allow arbitrary mutation of historical medication events.

------------------------------------------------------------------------

# 9. Medication Events

## GET /me/medication-events

Owner-only, paginated with page/limit. Optional filters: treatmentId,
treatmentMedicationId, from/to (UTC instants), status. Whitelist fields and
validate range ordering. Return events with id, occurrenceId, scheduledAt,
recordedAt, status and notes. Patient IDs are derived, never accepted as scope.
Shared history uses the grant-scoped history endpoint.

## POST /me/medication-events

```json
{"occurrenceId":"uuid","status":"TAKEN","notes":null}
```

The implemented event API accepts TAKEN/SKIPPED only and requires a due ACTIVE
occurrence. No automatic MISSED event or missed-dose cutoff is implemented.
Identical retries return the original record even after treatment completion.

Treatment detail returns eligible occurrences with occurrenceId, localDate,
scheduledAt and timezone. The server creates/retrieves each occurrence using
unique(schedule_id, local_date); UTC timestamp is not its identity.

Authenticate owner and verify occurrence→schedule→treatment ownership and
eligibility. Derive medication ID, patient and scheduled time server-side.
Atomically enforce unique medication_events.occurrence_id. An identical retry
returns the original event without duplicate audit/notification effects; a
conflicting outcome returns MEDICATION_EVENT_CONFLICT (409), not a silent edit.
Unknown/wrong-owner occurrences return RESOURCE_NOT_FOUND.

------------------------------------------------------------------------

# 10. Sharing — bootstrap creation

## POST /me/shares

Patient-only. Derive patient identity server-side. Require explicit permission
selection and grant expiry confirmation; DOCTOR and PHARMACY are the only V1
recipient types. Bootstrap expiry and ongoing grant expiry are different fields.

```json
{
  "recipientType": "DOCTOR",
  "expiresIn": 900,
  "maxUses": 1,
  "grantExpiresAt": null,
  "permissions": ["READ_MEDICATIONS", "READ_INVENTORY", "READ_PRESCRIPTIONS"]
}
```

`grantExpiresAt` is required: a future instant or an explicitly confirmed null
(no scheduled expiry). Do not default to indefinite access silently. Limits for
expiresIn/maxUses and attempts require security configuration before sharing;
900 is an example, not an approved universal TTL. No unapproved multi-use UI is implied.

Create session/requested permissions/audit atomically. Return:

```json
{"data":{"id":"session-uuid","code":"7K4P9X","expiresAt":"2026-09-14T22:30:00Z","grantExpiresAt":null,"permissions":["READ_MEDICATIONS","READ_INVENTORY","READ_PRESCRIPTIONS"]},"meta":{}}
```

Plaintext code is available only at creation; only its secure hash is persisted.
QR carries a bootstrap redemption mechanism, never health data or an access token.

# 11. Share Redemption

## POST /shares/redeem

Authenticated DOCTOR/PHARMACY request: `{"code":"7K4P9X"}`.
Check format, rate limits, code verification, bootstrap and requested grant expiry, cancellation, counters,
consumption, recipient role and professional-verification requirements. Exact
professional provisioning/verification policy remains an explicit pre-sharing gate.
The server derives recipientUserId; clients cannot select an arbitrary recipient.

Transactionally lock/check the session, increment use_count, create an AccessGrant
and permission snapshot, set consumed_at when max_uses is reached, and append audit.
A repeated successful redemption by the same authenticated recipient returns its
existing grant without another use/grant; it never renews an expired/revoked grant.
Other attempts against an exhausted code return SHARE_CODE_CONSUMED. Cancellation
or expiry blocks new grants, not a read of a previously issued grant.

```json
{"data":{"grantId":"grant-uuid","patient":{"id":"patient-uuid","displayName":"Imane Example"},"permissions":["READ_MEDICATIONS","READ_INVENTORY","READ_PRESCRIPTIONS"],"grantedAt":"2026-09-14T22:20:00Z","expiresAt":null},"meta":{}}
```

Return only minimal identity/scope metadata here. The code and session ID are not
credentials for subsequent requests.

# 12. Grant-scoped Shared Resources

All routes below use AccessGrant identity:

```http
GET /shared/:grantId/medications
GET /shared/:grantId/inventory
GET /shared/:grantId/expiry
GET /shared/:grantId/prescriptions
GET /shared/:grantId/prescriptions/:id
GET /shared/:grantId/prescriptions/:id/documents/:documentId/download
GET /shared/:grantId/treatments
GET /shared/:grantId/treatments/:id
GET /shared/:grantId/history
```

Every request authenticates the recipient, checks recipientUserId, role,
patient scope, grant revocation/expiry and the route's permission. Collections
use page/limit pagination. History supports from/to and treatmentId filters;
resource IDs never expand grant scope. Wrong-owner/unrelated grant/resource IDs
return RESOURCE_NOT_FOUND. A known recipient's revoked grant returns
SHARE_GRANT_REVOKED; an expired one returns SHARE_GRANT_EXPIRED. A missing
permission returns FORBIDDEN. Bootstrap expiry is never checked as ongoing authority.

Projection rules are canonical in SHARING.md section 3:

- medications requires READ_MEDICATIONS: medicine identities only, no inventory,
  regimen, document or history fields.
- inventory requires READ_INVENTORY: current quantities/units. Expiry/batch fields
  are omitted unless READ_EXPIRY is also granted, including nested objects.
- expiry requires READ_EXPIRY: expiry/batch projection, no quantities without
  READ_INVENTORY. Only current inventory participates.
- prescriptions/detail/download require READ_PRESCRIPTIONS and CONFIRMED business
  state: confirmed instructions/documents, not raw OCR revisions or unrelated history.
- treatments/detail require READ_TREATMENTS: regimen/schedules, no event history
  or adherence/progress derived from events unless READ_HISTORY is present, and
  no inventory availability unless its separate permissions are present.
- history requires READ_HISTORY: relevant medication events, without private event
  notes, audit/security logs, raw OCR, prescriptions or stock. Minimum medicine identity needed to label
  a permitted row is allowed; unrelated datasets are not implicitly granted.

Downloads additionally validate document membership and lifecycle, issue a fresh
short-lived signed URL, and audit. Grant revocation stops new downloads/URL
issuance; already-issued URLs have the bounded lifetime described in TABLES.md.

# 13. Bootstrap Sessions and Access Grants

## GET /me/shares/active

Patient-only, paginated list of still-redeemable bootstrap sessions. Return ID,
recipientType, permissions, expiresAt, grantExpiresAt and counters, never code/hash.
This is not the patient's active-recipient list.

## GET /me/access-grants

Patient-only list of granted access, paginated, with optional active/revoked/expired
state filter. Return grantId, recipient identity summary, recipientType,
permissions, grantedAt, expiresAt and revokedAt. Omit internal secrets/audit metadata.

## GET /me/access-grants/:grantId

Owner-only detail of the same projection. No unrelated patient's grant disclosure.

## GET /shared/access-grants

Authenticated professional's paginated active-grant list, with minimal patient
identity and permitted scopes. This powers the Doctor/Pharmacy patient dashboard.
Group by patient in the UI if useful; never combine grants to silently broaden a
single grant-scoped request. Place this static route ahead of dynamic routes.

# 14. Cancel Bootstrap / Revoke Access

## DELETE /me/shares/:id

Patient owner cancels the bootstrap by setting cancelled_at. Idempotent; return
standard success. It prevents further redemption and does not revoke any grant.

## DELETE /me/access-grants/:grantId

Patient owner revokes the grant by setting revoked_at and revoked_by atomically
with audit. Idempotent; preserve history. Every subsequent shared request must
fail authorization, including cached authorization decisions. Do not erase logs.

# 15. Sharing Audit

## GET /me/shares/audit

Patient-only, paginated events for session creation/cancellation/redemption,
grant creation/revocation and scoped access. Return safe actor summary, action,
resource reference and timestamp. Raw IP/user-agent, codes, tokens and unrelated
medical content are not part of the patient projection.

------------------------------------------------------------------------

# 16. Doctor Connections — FUTURE, not baseline endpoints

## GET /me/doctors

List active/pending doctor connections.

## POST /me/doctors/:doctorId/connect

Create/request persistent relationship where allowed.

## DELETE /me/doctors/:doctorId

Revoke connection.

Future connection metadata never grants patient access by itself. V1 professional
access uses AccessGrant endpoints above; separate connection requests are deferred.

------------------------------------------------------------------------

# 17. AI API

## POST /ai/ask

### Request

``` json
{
  "message": "What medicines do I have that expire soon?"
}
```

The API passes authenticated context to the AI orchestration layer.

The model does not receive arbitrary database credentials.

### Conceptual execution

``` text
POST /ai/ask
 ↓
AI orchestrator
 ↓
typed tool
 ↓
authorization
 ↓
domain service
 ↓
database
 ↓
tool result
 ↓
AI response
```

------------------------------------------------------------------------

# 18. Notification API

## GET /me/notifications

Pagination required.

## PATCH /me/notifications/:id/read

Marks notification as read.

## PATCH /me/notifications/read-all

Marks eligible notifications as read.

------------------------------------------------------------------------

## GET /me/notification-preferences

Implemented in D019 and docs/NOTIFICATION-PREFERENCES.md for every active
account role, scoped to the authenticated owner.

Authenticated owner. Return `data: {configured: false, preferences: null}` if not
configured; do not fabricate consent/default booleans. Otherwise return configured
true and the five flags doseReminders, expiryReminders, lowStockAlerts,
sharingNotifications, systemNotifications, plus expiryLeadDays (nullable integer).

## PATCH /me/notification-preferences

Owner-only. First configuration supplies all five booleans; later requests may
patch allowlisted fields. expiryLeadDays is null or a nonnegative integer.
Persist in notification_preferences; return the same GET projection. Reject
owner fields and unknown keys. No row is not permission to send alerts.
Low-stock thresholds are explicit per-inventory values, managed through inventory
PATCH; no global cross-unit numeric threshold is introduced. Product defaults,
product expiry lead-time bounds, missed-dose cutoff and delivery provider remain
open. Persistence accepts 0–2147483647, the PostgreSQL INTEGER range. Changed
saves are audited transactionally; identical saves preserve timestamps and
create no duplicate audit. No notification is sent by these endpoints.

# 19. Medication Requests — FUTURE, excluded from baseline endpoints

## POST /me/medication-requests

Create community availability request.

### Request

``` json
{
  "medicineId": "uuid",
  "quantity": 1,
  "city": "Oran",
  "wilaya": "Oran",
  "description": "Looking for this medicine"
}
```

Avoid precise patient location by default.

## GET /medication-requests

Only expose requests according to privacy and geographic rules.

------------------------------------------------------------------------

# 20. Error Codes — canonical vocabulary

All API examples and implementations use this vocabulary. API.md and
API-IMPLEMENTATION-RULES.md reference this section rather than defining aliases.

```text
AUTH_REQUIRED
AUTH_INVALID_CREDENTIALS
AUTH_SESSION_EXPIRED
AUTH_SESSION_REVOKED
AUTH_ACCOUNT_DISABLED
AUTH_ACCOUNT_SUSPENDED
RESOURCE_NOT_FOUND
FORBIDDEN
VALIDATION_ERROR
RATE_LIMITED
SHARE_CODE_INVALID
SHARE_CODE_EXPIRED
SHARE_CODE_CONSUMED
SHARE_CODE_CANCELLED
SHARE_CODE_ATTEMPTS_EXCEEDED
SHARE_GRANT_REVOKED
SHARE_GRANT_EXPIRED
PROFESSIONAL_NOT_VERIFIED
PRESCRIPTION_CONFIRMATION_REQUIRED
PRESCRIPTION_REVIEW_CONFLICT
TREATMENT_CONFLICT
SCHEDULE_TIME_INVALID
DOCUMENT_CONFLICT
MEDICATION_EVENT_CONFLICT
FILE_TOO_LARGE
FILE_UNSUPPORTED_TYPE
PROCESSING_FAILED
SERVICE_UNAVAILABLE
AI_TOOL_UNAVAILABLE
AI_UNCERTAIN
```

HTTP mapping: AUTH_* authentication failures 401 (disabled/suspended accounts 403);
FORBIDDEN, PROFESSIONAL_NOT_VERIFIED and invalidated grants 403;
RESOURCE_NOT_FOUND 404; RATE_LIMITED 429; validation/invalid or expired bootstrap
codes and SCHEDULE_TIME_INVALID 400; consumed/cancelled bootstrap codes and
review/event/document/treatment conflicts and PRESCRIPTION_CONFIRMATION_REQUIRED 409;
FILE_TOO_LARGE 413; FILE_UNSUPPORTED_TYPE 415. A synchronous processing failure
returns PROCESSING_FAILED (500); async jobs expose that code in safe processing
metadata. AI_TOOL_UNAVAILABLE is 503; AI_UNCERTAIN is a safe domain uncertainty
result, not a claim of medical correctness. Explicit error responses retain the
standard error envelope.

Operational readiness failure uses SERVICE_UNAVAILABLE (503) with empty details;
it does not disclose connection strings, SQL, database names or provider errors.

Field-level invalid quantities, units, dates and schedules use VALIDATION_ERROR
with safe details. Missing resource variants use RESOURCE_NOT_FOUND to avoid
patient enumeration. No stack traces, provider errors, token material or SQL.

# 21. Pagination

Use a consistent pagination model.

Initial MVP:

``` text
page
limit
total
```

Example:

``` json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 124,
    "totalPages": 7
  }
}
```

For high-volume event streams, cursor pagination should be introduced
later.

------------------------------------------------------------------------

# 22. Filtering and Sorting

Every collection endpoint should document supported filters.

Do not expose arbitrary database field sorting.

Whitelist sortable fields.

Example:

``` text
sort=expiry_asc
sort=name_asc
sort=created_desc
```

------------------------------------------------------------------------

# 23. File Upload API Rules

File uploads must:

-   validate MIME type
-   validate actual file signature where practical
-   enforce size limits
-   generate safe object names
-   store outside the application filesystem where practical
-   scan/process asynchronously when needed
-   enforce access control on retrieval

Never trust the filename supplied by the client.

------------------------------------------------------------------------

# 24. Idempotency

Use idempotency keys for operations where retrying could create
duplicate side effects.

Candidates:

``` text
POST /me/inventory
POST /me/prescriptions
POST /me/treatments
POST /me/medication-events
POST /me/shares
```

Occurrence recording and share redemption require transactional idempotency now
in their contracts; generic request-idempotency storage is decided per later slice.

------------------------------------------------------------------------

# 25. Authorization Matrix

  ---------------------------------------------------------------------------
  Resource        Patient        Doctor         Pharmacy       Admin
  --------------- -------------- -------------- -------------- --------------
  Own inventory   CRUD           ---            ---            controlled

  Own             CRUD           shared only    shared only    controlled
  prescriptions                                                

  Own treatments  CRUD           shared only    shared only    controlled

  Medicine        READ           READ           READ           CRUD
  catalog                                                      

  Share creation      YES            ---            ---            no baseline bypass
  Shared data     owner          scoped         scoped         controlled

  Audit           own relevant   own relevant   own relevant   operational
                  logs           logs           logs           

  Medicine        ---            ---            ---            YES
  imports                                                      
  ---------------------------------------------------------------------------

This matrix is a baseline. Endpoint-level permission checks are
authoritative.

------------------------------------------------------------------------

# 26. API Security Rules

1.  Authentication before protected controllers.
2.  Authorization before resource retrieval where practical.
3.  Ownership must be checked server-side.
4.  Avoid resource enumeration leaks.
5.  Rate-limit authentication and share redemption.
6.  Validate all input.
7.  Sanitize output.
8.  Never return secrets.
9.  Audit sensitive access.
10. Never expose database internals.

------------------------------------------------------------------------

# 27. API Versioning and Compatibility

Current:

``` text
/api/v1
```

Breaking changes require a new version.

Prefer additive changes whenever possible.

------------------------------------------------------------------------

# 28. OpenAPI

The NestJS API should generate an OpenAPI specification from the
implementation.

The generated OpenAPI document must be checked against this
specification.

Recommended workflow:

``` text
root API-CONTRACT.md
 ↓
implementation
 ↓
OpenAPI
 ↓
contract tests
```

Do not allow implementation to silently drift from documented contracts.

------------------------------------------------------------------------

# 29. API Acceptance Gate

Before the API is considered ready:

-   [ ] Every endpoint has authentication rules
-   [ ] Every patient endpoint has ownership checks
-   [ ] Every shared endpoint has permission checks
-   [ ] Request validation exists
-   [ ] Stable errors exist
-   [ ] Pagination is consistent
-   [ ] OpenAPI generated
-   [ ] Authorization tests pass
-   [ ] Cross-patient access tests fail correctly
-   [ ] Bootstrap expiry and independent grant revocation/expiry tests pass
-   [ ] No endpoint exposes database credentials/internal secrets

## Contract boundary notes

Zod shared schemas support client validation; NestJS boundary validation rejects
unexpected fields. Domain/ownership rules remain server-side. Public registration
creates PATIENT accounts only. This task does not define broad admin endpoints,
professional onboarding, provider integrations, or recovery implementation.

## Implemented manual review finalization

PATCH prescription status=CONFIRMED requires confirmationFieldIds containing the
current field IDs for all retained lines. Every field must be reviewed, including
unknown null values; medicineId, dosage/unit, explicit daily times and dates must
be present. D020 defines the supported subset and rejects contradictory frequency
or duration summaries. This records user review, not professional verification.

## Implemented reminder inbox (D021)

GET `/me/notifications` accepts page, limit and optional unread=true|false.
PATCH `/me/notifications/:id/read` and `/me/notifications/read-all` accept an empty
object and return `{data:{updatedCount:number},meta:{}}`. Reads and mutations are
owner scoped; unknown query/body fields are rejected. Current notification type:
DOSE_DUE. See [the full contract](docs/REMINDERS.md) and generated OpenAPI.
