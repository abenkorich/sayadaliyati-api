# Patient inventory backend

Implemented September 24, 2026, following Phase 4 of the execution plan.
Mobile/Android and camera work remain deferred at the user's request.

## Implemented scope

Patient-owned inventory now supports add, list, detail, edit and archive operations.
Each row links to one catalog medicine and stores a separate batch's explicit
quantity/unit, nullable batch/expiry/purchase/storage/source/notes fields and
nullable low-stock threshold. No stock ledger, treatment deduction, reminders,
clinical suitability checks, shared access, admin editing or mobile UI is included.

## Routes and ownership

All routes are under `/api/v1/me/inventory`, require an active PATIENT session,
and use the existing protected-route rate budget. Ownership comes only from the
session. DOCTOR, PHARMACY and ADMIN cannot use these patient routes as a bypass.

- `GET /me/inventory`: paginated current inventory, excluding archives.
- `POST /me/inventory`: create a separate batch and return 201.
- `GET /me/inventory/:id`: current owner detail.
- `PATCH /me/inventory/:id`: edit only allowlisted mutable fields.
- `DELETE /me/inventory/:id`: archive and return `{data: {}, meta: {}}`.

Wrong-owner, missing and archived IDs return `RESOURCE_NOT_FOUND` for current
GET/PATCH routes. Wrong-owner DELETE also returns 404. Repeating an owner's DELETE
returns success without another archive event. Malformed UUIDs/inputs return
`VALIDATION_ERROR`. Client-supplied patientId, ownerId, id, archivedAt and other
unexpected fields are rejected. medicineId cannot change after creation.

## Values and response contract

POST requires medicineId, quantity and unit. The medicine must exist; its explicit
catalog status is returned even if INACTIVE/ARCHIVED, because a patient can still
record an existing package. Recording it is not a recommendation to use it.
The source field is a user-declared label, not evidence of automated verification.

Quantity and lowStockThreshold accept JSON numbers from 0 through 999999999.999
with at most three decimal places. Reject missing/null quantity, numeric strings,
negative/non-finite values and excess precision rather than silently rounding.
Responses use exact decimal strings (threshold can be null). Unit must be one of
the machine codes in [ENUMS.md](../ENUMS.md); never derive it from strength or AI.

Dates are valid `YYYY-MM-DD` calendar strings in years 0001–9999 or null. Preserve
them as date-only values, with no timezone conversion or inferred expiry. Invalid
leap days, impossible dates and timestamps are rejected. Unknown dates remain null;
past expiry and purchase dates are allowed. No inference is made about suitability.

Optional text is trimmed, nonblank when supplied and rejects NUL. Maximum lengths:
batchNumber 100, storageLocation 150, notes 4000 characters. Send null to clear an
optional field; omitted PATCH fields stay unchanged. Empty patches are rejected.
The existing 16 KiB request-body limit also applies.

Changing unit requires quantity and lowStockThreshold in the same patch. Supply a
new threshold in that explicit unit or null to clear it. There is no conversion of
existing values. Quantity edits are absolute replacements, not increments. Edits
are serialized per row, with the last accepted edit to a field taking effect;
optimistic client version checks and a stock transaction ledger are deferred.

Responses include inventory ID, medicineId, the medicine identity/status, current
fields, createdAt/updatedAt and derived isLowStock. Patient IDs and archive metadata
are not exposed by current inventory routes. No cacheable response contains data.

## List filters

All filters intersect and remain patient-scoped. Unknown/repeated parameters are
rejected. Defaults are page=1, limit=20, sort=created_desc; maximum page is 10000
and maximum limit is 100. The response meta contains page, limit, total, totalPages.
Rows and count use the same repeatable-read snapshot. Empty results have totalPages=0.

- `q`: nonblank, at most 200 characters; normalized literal case-insensitive search
  across medicine name/brand/generic name and batch number. Preserve accents/Arabic;
  escape SQL LIKE wildcards. It does not search private notes or infer equivalents.
- `medicineId`: exact UUID.
- `status`: only ACTIVE is supported, meaning unarchived inventory. It is not the
  medicine status or a computed expired/expiring label. Archives remain excluded.
- `expiryBefore`: exclusive calendar-date cutoff; unknown expiry is excluded.
- `lowStock=true`: quantity is at or below this row's explicit threshold.
- `lowStock=false`: quantity is above its threshold, or the threshold is unset.
  An unset threshold never flags low stock. No quantities are summed across units.
- `sort`: created_desc, name_asc or expiry_asc; ties use inventory UUID ascending.
  Unknown expiry sorts last. No user-controlled SQL fields are accepted.

An expiry-soon window, default low-stock threshold and notification timing are
not introduced here; those policies belong to the later notifications slice.

## Audit, concurrency and persistence

Migration `20260924000400_patient_inventory` adds the inventory enums/table,
foreign keys, quantity/date constraints and indexes, including a SQL-managed
partial index for unarchived patient rows. User/medicine foreign keys use RESTRICT.
SQL constraints also reject NaN numeric values and out-of-range calendar dates.

The application role can SELECT, INSERT the allowlisted fields and UPDATE only
mutable fields/archive timestamp/updatedAt. It cannot DELETE, rewrite an owner,
change the medicine link or rewrite creation time. Application services enforce
patient ownership; these grants are not row-level security.

Mutations revalidate the patient session inside their transaction. PATCH/DELETE
also lock the owner row before checking archive/unit state. An archive racing
an edit cannot resurrect the row. Concurrent archive retries emit one event.
Archive preserves quantities, units and the catalog link.

INVENTORY_CREATED, INVENTORY_UPDATED and INVENTORY_ARCHIVED audit events are inserted
in the mutation transaction. Audit failure rolls back the entire operation.
Metadata contains outcome and request ID, never notes, quantities or credentials.

POST intentionally creates a new row even for repeated identical input, supporting
multiple batches. Generic request-idempotency storage is deferred for this slice;
clients must not automatically retry POST after an ambiguous network result.
Reconcile against the list first. DELETE is already idempotent.

## Run and verify

Use the pinned runtime from [BOOTSTRAP.md](BOOTSTRAP.md):

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:up
pnpm build
pnpm db:migrate
pnpm db:grant-local
pnpm db:seed-catalog
pnpm check
pnpm test:integration
pnpm api:start
```

The catalog seed contains synthetic demo medicines only. No patient inventory is
seeded into development. The integration suite creates scoped synthetic accounts,
medicines and inventory, and removes its own records afterward. API integration
files run serially because audit-failure tests temporarily change privileges on
the shared test database. Do not run multiple integration suites concurrently.

Tests cover the login → catalog lookup/manual selection → add → list API journey,
owner isolation, role denial, decimal/date validation, null clearing, unit changes,
low-stock/expiry filtering, pagination, archive races, audit rollback and DB grants.
The generated [OpenAPI contract](api.openapi.json) includes these routes.

## Verification result

At completion of this slice: `pnpm check` passed, with 20 unit/API tests,
17 database tests and 57 HTTP integration tests (94 total). All four migrations
applied to an empty isolated schema; the active inventory partial index was
verified and no development-database model drift was detected.
