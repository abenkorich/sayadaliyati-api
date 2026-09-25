# Reminder worker and notification inbox

## Implemented scope

A separate BullMQ worker delivers DOSE_DUE records to the private API inbox.
There is no Android/iOS push, device registration, SMS or email delivery in this
slice. The API does not start a worker automatically.

After local setup, migration and build, run `pnpm worker:start` in a separate
terminal alongside `pnpm api:start`. PostgreSQL and Redis must be available.
The development worker shares the restricted application database principal;
production deployment still needs worker-specific provisioning and monitoring.

## Delivery rules

Every ten seconds, select at most 100 due occurrences from the preceding five
minutes. An active patient must have explicitly enabled doseReminders. The
schedule and treatment must remain active, with no recorded medication event.
Delivery rechecks current account, consent, treatment and event state under
transaction locks. Cancellation, opt-out or a recorded dose suppresses pending work.

The five-minute freshness window is an operational notification lifetime. It does
not classify a dose as missed or recommend taking medication late. Outages longer
than this window do not trigger a backlog of stale reminders. This is best-effort
inbox delivery, with no guaranteed timing or phone alert.

Jobs contain only an occurrence UUID and use a stable job ID. A unique database
occurrence key prevents duplicate inbox records even after queue cleanup or Redis
loss. Inbox creation and its audit record commit together. Workers run two jobs
concurrently, with three attempts and exponential backoff starting at ten seconds.
Completed jobs are retained for at most one day/10,000 entries; failures for seven
days/10,000 entries. Retention cleanup follows BullMQ's job processing behavior.
Persisted failure messages are generic. Suppressed jobs are not automatically
replayed when consent is later re-enabled. The bounded polling batch may defer
newer work under heavy load; production capacity testing remains necessary.

Generic English, French or Arabic text follows the current profile language.
Messages contain no medicine name, dosage or patient name. Navigation data contains
only treatmentId and occurrenceId and must be resolved through authenticated APIs.
No missed-dose, expiry, low-stock or sharing notifications are generated yet.

## Inbox contract

All routes require an active authenticated account and operate on its own inbox.

- GET `/api/v1/me/notifications`: page (1–10000, default 1), limit (1–100,
  default 20), optional unread (`true` or `false`). Unknown parameters are rejected.
  Returns data plus page, limit, total and totalPages metadata; newest first.
- PATCH `/api/v1/me/notifications/:id/read`: empty JSON object; returns
  `{data:{updatedCount:0|1},meta:{}}`. Foreign or unknown IDs return 404.
- PATCH `/api/v1/me/notifications/read-all`: empty JSON object; returns the number
  changed. Both read mutations are idempotent and audited only when rows change.

Items expose id, type, title, body, data, readAt and createdAt. The current type is
DOSE_DUE. There is no client endpoint for inserting or deleting notifications.
Database grants allow content insertion and read_at updates, with no deletion,
content rewriting or owner reassignment. A composite foreign key verifies that
an occurrence belongs to the notification recipient.

## Verification

`pnpm check` validates builds, formatting, lint, types and unit tests.
`pnpm test:integration` uses dedicated local test PostgreSQL/Redis resources and
synthetic patients to exercise concurrent deduplication, real queue processing,
current consent/state suppression, freshness bounds, localization, inbox ownership,
read idempotency, audit rollback and database privileges. Queue cleanup is scoped
to a unique test queue; tests never flush Redis or send phone notifications.
