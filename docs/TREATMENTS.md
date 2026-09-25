# Prescription review and fixed-time treatments

Implemented September 25, 2026 (D020). This backend connects explicit manual
prescription review to planned treatments, activation, immutable schedules and
patient-recorded dose events. It does not recommend medication, judge whether a
regimen is medically appropriate, deliver notifications, or deduct inventory.

## Explicit prescription confirmation

The patient reviews the latest revisions through the existing field-review API.
To finalize, PATCH `/api/v1/me/prescriptions/:id` with `status: "CONFIRMED"` and
`confirmationFieldIds`: every current field ID for every retained medication.
The array is a review snapshot, not a selection of fields to ignore. Stale IDs
return PRESCRIPTION_REVIEW_CONFLICT. Confirmation and audit commit together.

The first supported finalization subset is a MANUAL draft with 1–20 distinct
medicine lines. Rejected lines remain in history and are excluded. Every one of
the fourteen current fields must be explicitly reviewed, including null values.
Required non-null values are medicineId, dosage, dosageUnit, scheduledTimes,
startDate and endDate. There must be 1–12 distinct explicit daily times. If a
frequency is supplied, its unit must be DAY and its value equal the time count;
if duration is supplied, its unit must be DAY and its value equal the inclusive
calendar-date span. Other regimen forms remain unsupported. Unknown quantity can
remain null; no prescription quantity, dose, unit or schedule is inferred.

This is the patient's confirmation of entered information, not professional
verification or a clinical safety check. The application does not choose doses
or resolve contradictory medical instructions. Incomplete or unsupported reviews
return PRESCRIPTION_CONFIRMATION_REQUIRED (409). Explicit confirmation changes
retained line summaries and the prescription state, never creates a treatment.
An identical confirmation snapshot is idempotent. Confirmed fields cannot be
edited through the draft API; archiving still preserves the original history.

## Treatment API

All routes require an active PATIENT session and enforce ownership. Professional
and admin roles have no bypass. The existing protected Redis budget applies.

- `POST /api/v1/me/treatments`: save a PLANNED treatment. Require name, startDate,
  endDate and 1–20 distinct medicine entries. Each entry requires medicineId,
  positive dose (up to four decimal places), explicit doseUnit,
  scheduleType=FIXED_TIMES, and 1–12 schedules. instructions is nullable.
- Each schedule requires time (HH:mm), explicit unique daysOfWeek (Sunday=0),
  startDate and endDate, contained within the treatment dates. The treatment
  start cannot precede today in the captured profile timezone. The inclusive
  span is at most 366 days, with at most 5000 scheduled occurrences across the
  course. These are implementation bounds, not recommended treatment durations.
- `prescriptionId` is optional/null for direct manual entry. A supplied ID must
  reference an owner CONFIRMED manual prescription. Every retained medication's
  dose, unit, instructions and daily schedule/date range must match the reviewed
  fields exactly. No rejected line, substitution or partial prescription copy
  becomes treatment input. New treatments use ACTIVE catalog medicines.
- `GET /api/v1/me/treatments`: owner pagination (page 1–10000, limit 1–100,
  defaults 1/20), optional status. Sort createdAt descending, UUID ascending.
- `GET /api/v1/me/treatments/:id`: immutable medication/schedule snapshots, stable
  occurrences with occurrenceId/localDate/timezone/scheduledAt, nullable event,
  eligibility flag and factual counts. Dates are YYYY-MM-DD; dose is an exact
  decimal string. The response includes the bounded whole course.
- `PATCH /api/v1/me/treatments/:id`: explicit status only. Allowed transitions:
  PLANNED → ACTIVE/CANCELLED; ACTIVE → COMPLETED/CANCELLED. Same-state requests
  are idempotent. Terminal states cannot resume. Regimen edits, pause/resume and
  schedule replacement remain unavailable; cancel and create an explicit new
  plan without modifying historical schedules.

Each POST creates a separate treatment; automatic retries after an ambiguous
creation response are not supported. Clients must reconcile their treatment list
before repeating creation. Activation and event recording are safe to retry.
Duplicate regimen detection across separate treatments is not implemented.

## Time and occurrence policy

The schedule captures the patient's IANA timezone at creation. Profile changes
and travel do not silently change it. Daylight-saving gaps and folds are rejected
using Temporal's explicit `disambiguation: "reject"`; no offset is silently
chosen, dose moved, duplicated or skipped. The client must obtain explicit
corrected timing rather than inventing a medically suitable alternative.

Creation validates every applicable date. Activation validates again and
materializes only instants at or after activation, in the same transaction as
status and audit. Earlier dates/times are not backfilled or labeled missed. An
activation with no remaining occurrences fails. The prescription must still be
confirmed and catalog medicines active at activation. Unique(schedule_id,
local_date) is the stable identity; response formatting and retries cannot create
another occurrence. UTC instants remain unchanged after materialization, even
if the profile or a later timezone database changes. Rules follow the pinned
Node/ICU timezone database and [Temporal semantics](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).

No eligible occurrence exists before activation. Future occurrences are visible
but cannot receive an event yet. Completing/cancelling blocks new events and
keeps existing history and occurrences. Due-count summaries stop advancing at
that terminal transition; no future cancelled dose is classified as missed.
No automatic completion, catch-up dose advice or missed-dose cutoff is chosen.

## Dose events and factual progress

- `POST /api/v1/me/medication-events` accepts only occurrenceId, status TAKEN or
  SKIPPED, and nullable notes (maximum 2000 characters). The server derives owner,
  medication and scheduledAt; recordedAt is server time.
- The occurrence must belong to the caller, its treatment must be ACTIVE and its
  scheduled time must have arrived. Late self-reporting remains possible while
  active; it records when the entry was made, not an asserted ingestion time.
- An identical status/notes retry returns the original event, even after the
  treatment ends. A different status or notes for the same occurrence returns
  MEDICATION_EVENT_CONFLICT (409). There is no event edit/delete endpoint.
- `GET /api/v1/me/medication-events` supports bounded page/limit, treatmentId,
  treatmentMedicationId, status, and from/to inclusive UTC instants. It returns
  owner records sorted scheduledAt descending then UUID ascending.

Progress reports scheduled, due, taken, skipped and unrecordedDue counts only.
Unrecorded is not MISSED and is not proof of non-adherence. The MISSED database
enum is reserved, but the API and background work do not create those events.
There is no adherence score, dose correction, clinical interpretation, mixed-unit
stock calculation or inventory deduction in this slice.

## Database, authorization and audit

Migration `20260925000200_treatments` adds five tables: treatments,
treatment_medications, medication_schedules, medication_occurrences and
medication_events. Foreign keys use RESTRICT. Prescription links enforce composite
owner identity; occurrence/event triggers verify denormalized ownership, timing
and medication scope. Positive dose/date/weekday checks and unique occurrence and
event constraints enforce core invariants. Readiness requires these tables.

Runtime grants allow explicit inserts and treatment status/activation updates.
Schedules, occurrences and events cannot be updated or deleted by the runtime
role. The API locks sessions and parent treatments to serialize activation,
termination and event recording. Events do not bypass parent authorization.
Sensitive mutations and sanitized audit records commit together; failed audit
rolls back confirmation, treatment, activation, occurrence and event changes.
Repeated identical state/event requests do not create duplicate audit records.

## Local verification and remaining work

After standard local database/private-storage setup, run `pnpm build`,
`pnpm db:migrate`, `pnpm db:grant-local`, `pnpm check` and `pnpm test:integration`.
Fixtures use synthetic medication instructions solely for tests.

Tests cover explicit reviewed transcription, incomplete/stale confirmation,
activation concurrency, stable IDs, timezone capture, DST gaps/folds and offset
changes, owner/role isolation, due/future eligibility, retry conflicts, terminal
states, database immutability/scope and transactional audit failure.

Reminder workers/providers, push-device registration, event corrections,
pause/resume, schedule replacement, stock ledger/availability calculations and
Android screens remain later slices. OCR remains separate from this manual flow.

## Verified result

`pnpm check` passed with 32 unit/API tests, build, formatting, lint, strict types
and schema checks. The full integration suite passed 17 database and 97 HTTP /
private-storage tests: 146 unique tests overall. All seven migrations applied to
an empty isolated schema (21 tables), with no Prisma model drift. Frozen offline
installation passed. No commit or remote operation was performed.
