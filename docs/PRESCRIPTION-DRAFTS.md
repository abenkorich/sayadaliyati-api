# Manual prescription drafts and field revisions

Implemented September 24, 2026 after the inventory milestone. This is a backend
foundation for manual drafts and field review, not a completed OCR or treatment
workflow. Android/camera work remains deferred.

## Available routes

All paths begin with `/api/v1/me/prescriptions` and require an active PATIENT
session. Wrong-owner IDs return RESOURCE_NOT_FOUND; professional/admin roles have
no bypass through these owner routes. The existing protected rate budget applies.

- `GET /me/prescriptions`: owner list, page/limit pagination (defaults 1/20,
  maximums 10000/100), optional DRAFT/CONFIRMED/ARCHIVED status. Default excludes
  archives. Sort by creation time descending, then UUID ascending. Return
  total/totalPages and medicationCount using a consistent snapshot.
- `POST /me/prescriptions`: save a MANUAL/DRAFT prescription with processingStatus
  null, one to fifty medication lines and initial USER field revisions.
- `GET /me/prescriptions/:id`: owner detail, including latest field revisions and
  ordered non-deleted document metadata. Archived details remain owner-readable.
- `PATCH /me/prescriptions/:id`: review current manual-draft field IDs, reject
  lines, or archive the record. Edits append revisions, never overwrite history.
- `DELETE /me/prescriptions/:id`: idempotently archive, preserving all children.

Private image attachments and owner downloads were added in
[PRESCRIPTION-DOCUMENTS.md](PRESCRIPTION-DOCUMENTS.md). Scan/OCR, shared
prescriptions and treatment activation remain unavailable.

## Manual input and validation

POST permits source=MANUAL (also the default), nullable prescriptionDate/validUntil,
optional doctorId=null, and medications. Non-null doctorId is rejected until
verified professional identity provisioning is implemented. Do not infer a verified
doctor from a user ID or a name. Clients cannot assign patientId, business/processing
status, confirmation actors, confidence or field provenance.

Each medication identifies an existing medicineId or an unresolved extractedName.
An unresolved medicine keeps medicineId null. It may include the fourteen fields
listed in TABLES.md: medicineId, extractedName, strength, dosage, dosageUnit,
frequency, frequencyUnit, duration, durationUnit, quantity, instructions,
scheduledTimes, startDate and endDate. Missing values become null, never guesses.
Medication order is deterministic by creation timestamp/UUID; clients should use
returned line IDs for review and not rely on request array order.

Known quantity is >0, at most 999999999.999, with at most three decimal places.
Known dosage/frequency/duration are >0, at most 99999999.9999, with at most four
places. Reject excess precision, numeric strings, zero and negative values.
Decimal summary responses are exact strings; field revision JSON values retain
the validated scalar type. Unknown quantities and confidence remain null.

Dates use real YYYY-MM-DD calendar values in years 0001–9999. validUntil cannot
precede a known prescriptionDate; a known endDate cannot precede startDate.
Scheduled times are explicit unique HH:mm strings (1–24 entries), stored as draft
information only. They do not create schedules or choose timezone/DST behavior.
Text bounds: extractedName 255, strength 100, dose/frequency/duration units 50,
instructions 4000. Text is trimmed/nonblank and rejects NUL. The existing 16 KiB
request-body limit applies. Each POST creates a distinct draft; automatic retries
after an ambiguous result are not supported.

## Field review and provenance

The server creates revision 1 for every allowlisted field, including unknown null
values, with source USER, confidence null and confirmed=false. Medication summary
confirmationStatus is PENDING. Initial values and subsequent history are retained.

PATCH accepts up to 100 fieldReviews of `{fieldId, value, confirmed}` and optional
rejectedMedicationIds. The field ID identifies the latest revision; clients cannot
choose field names, source, confidence, actor or revision numbers. Duplicate IDs,
unknown types and unrecognized properties are rejected. Field-specific validation
runs again, followed by combined line/date/reference validation before any write.

A changed value appends a USER revision with null confidence. Confirming an
unchanged value preserves its source/confidence. Confirmed revisions record the
current patient and timestamp; unconfirmed revisions have neither. Medication
scalar summaries are updated in the same transaction. Strength, scheduled times
and start/end dates remain revision fields rather than invented scalar columns.

Stale/foreign field IDs return PRESCRIPTION_REVIEW_CONFLICT (409). A parent-row
lock serializes reviews, including different sessions, so concurrent reviews of
one current field have one winner. Clients must reload and resolve conflicts.
Rejected lines remain visible with their fields and cannot be edited back into
retained lines through this API. Rejection/field edits in the same request cannot
target the same line.

D020 now supports explicit finalization of a complete current review snapshot for
bounded manual daily regimens. PATCH status=CONFIRMED requires confirmationFieldIds;
individual field confirmations still do not automatically finalize or activate
anything. See [TREATMENTS.md](TREATMENTS.md) for required fields, concurrency and
exact prescription-to-treatment transcription.

## Archive, documents and database privileges

Archive changes only business status. Repeated DELETE or a standalone
PATCH `{status: "ARCHIVED"}` succeeds without duplicate archive audit. Do not mix
archive with field edits/rejections in one PATCH. Archived prescriptions cannot
be edited, but owner history remains readable. There is no restore/purge route.

Migration `20260924000500_prescription_drafts` adds prescriptions,
prescription_medications, prescription_extracted_fields and prescription_documents,
plus the canonical enums. Foreign keys use RESTRICT. Field revision uniqueness,
confirmation actor/time consistency, positive quantities/confidence ranges, date
ranges/order and document page/parent ownership are checked in PostgreSQL.

Document metadata is persisted for the future file pipeline. A composite
(prescription_id, patient_id) foreign key prevents cross-patient document links.
The subsequent document slice grants explicit document INSERT and storage-key
SELECT for authorized owner downloads. UPDATE/DELETE remain prohibited. Ordinary
details never return storage keys or URLs; see PRESCRIPTION-DOCUMENTS.md.

Field revision rows are SELECT/INSERT-only for the application role. Prescription
ownership/source/doctor links and medication parent links cannot be rewritten,
and application DELETE privileges are absent. Mutation and sanitized audit events
(PRESCRIPTION_CREATED, PRESCRIPTION_FIELDS_REVIEWED, PRESCRIPTION_ARCHIVED) commit
together. Audit failure rolls back drafts, revisions, summaries and archive changes.
Audit metadata contains request ID/result, not medication instructions or values.

## Development and verification

Run the standard local setup from [PATIENT-INVENTORY.md](PATIENT-INVENTORY.md),
including `pnpm db:migrate` and `pnpm db:grant-local` after building. No prescription
or patient data is seeded into development. Integration tests create scoped
synthetic data only and clean it afterward.

```sh
pnpm check
pnpm test:integration
pnpm openapi:generate
pnpm metadata:check
```

Tests cover draft creation, owner/role isolation, pagination, unknown quantities,
strict input/provenance, append-only history, concurrent/stale reviews, rejected
lines, archive preservation, document ownership/projection, database privileges,
audit rollback and the prohibition on automatic prescription confirmation.

## Remaining prescription work

OCR, professional identity linking and advanced regimen support remain open.
Private files and the supported manual review/treatment flow are implemented;
see PRESCRIPTION-DOCUMENTS.md and TREATMENTS.md. Production lifecycle policy and
mobile review screens remain pending.

## Verification result

At completion of this slice, `pnpm check` passed with 23 unit/API tests. The
integration suite passed 17 database tests and 71 HTTP integration tests (111
unique tests across all suites). The final prescription-specific suite also
passed after the last schema/document-metadata adjustments. All five migrations
applied to an empty isolated schema (15 tables), with no detected model drift.
Frozen offline installation and documentation integrity checks passed. Historical
audit/design assets were preserved; no local credentials were found in Git-visible
files. No commit or remote operation was performed.
