# Medicine catalog backend

Implemented September 24, 2026, following Phase 3 of the execution plan.
Android/mobile work is deferred at the user's request.

## Scope

The catalog repository, API and database model now support medicine search,
canonical details and exact barcode lookup. Six new tables store medicines,
manufacturers, ingredients, ingredient associations, barcodes and image metadata.
No catalog mutation endpoint, real-data import, inventory or scanner UI is included.

## Access and responses

All three routes use the existing authenticated-session guard and its shared
120 requests/IP/minute budget. PATIENT, DOCTOR, PHARMACY and ADMIN can read catalog
identities. Expired/revoked sessions and disabled/suspended accounts cannot read.
Anonymous browsing is not enabled in this slice. Runtime database grants are
SELECT-only on the six catalog tables, including for ADMIN API sessions.

- `GET /api/v1/medicines`: paginated browse/search.
- `GET /api/v1/medicines/:id`: canonical identity and related metadata.
- `GET /api/v1/medicines/barcode/:barcode`: exact lookup returning the same detail.

Success uses `{ data, meta }`. Invalid inputs return `VALIDATION_ERROR` (400);
unknown valid UUIDs/barcodes return `RESOURCE_NOT_FOUND` (404). The shared auth,
rate-limit and safe error behavior also applies. Unknown query filters are rejected.
The executable contract is generated in [api.openapi.json](api.openapi.json).

## Search semantics

`page` defaults to 1 (maximum 10,000); `limit` defaults to 20 (maximum 100).
Both require positive base-10 integer strings. `meta` contains page, limit, total
and totalPages, with zero totalPages for an empty result. Rows are ordered by
normalized name, then UUID. Count and rows use the same repeatable-read snapshot.

`q` is optional, nonblank when supplied and at most 200 characters. Normalize with
Unicode NFC, trim outer whitespace, collapse internal whitespace, and lowercase.
Perform case-insensitive literal substring search across normalized medicine name,
brand, generic name and normalized ingredient name. Preserve French accents and
Arabic characters. No fuzzy search, transliteration, clinical ranking or dose inference
is performed. SQL LIKE wildcard characters are escaped, and Prisma parameterizes
all values. Larger real catalogs may need a measured trigram-search migration.

`manufacturer` and `ingredient` are exact UUID filters; filters intersect.
`status` is ACTIVE (default), INACTIVE or ARCHIVED. A direct detail/barcode lookup
can return any status, explicitly labeled in its response, preserving historical
identification. A catalog match never creates inventory or implies suitability for use.

## Exact barcodes and detail projection

Barcode input is trimmed outer whitespace, then 1–100 printable non-space ASCII
characters. Preserve case and leading zeros. Do not strip digits, convert UPC to
EAN, calculate check digits, parse arbitrary QR payloads, fetch URLs or infer
which medicine a nonmatching code represents. QR/OTHER values must exactly match a
reviewed stored barcode. Clients must URL-encode a barcode used as a path segment.

Detail includes names, strength/form/route, package information, manufacturer,
status, ingredients, barcodes, ordered images and source/version/update timestamp.
Ingredient amounts are exact decimal strings or null, never inferred from strength.
Normalization fields, internal timestamps and audit metadata are not projected.
Image entries hold external HTTPS URLs; this slice does not fetch or upload images.

## Local setup and synthetic seed

With the pinned Node runtime and pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:up
pnpm build
pnpm db:migrate
pnpm db:grant-local
pnpm db:seed-catalog
pnpm api:start
```

The seed is explicit and is never part of API startup or migration. It refuses
production mode, remote database hosts and database names other than local
`saydaliyati`/`saydaliyati_test`. It uses the migration role, a transaction and a
transaction-level lock. Five stable, obviously synthetic records cover English,
French, Arabic, inactive and archived identities; source is
`SYNTHETIC_DEVELOPMENT_FIXTURE`. They contain no real pharmaceutical assertions,
dosage recommendations or real package barcodes. Example barcode: `DEMO-000001`.

Rerunning the seed does not duplicate or overwrite existing fixture rows. Identity
collisions with unrelated records abort. Every successful run appends a seed audit
event. Real Algerian medicine data still requires the staging, provenance,
licensing and review workflow in [ALGERIAN-MEDICINE-IMPORT.md](../ALGERIAN-MEDICINE-IMPORT.md).
Replacing the synthetic catalog with reviewed real data is a separate milestone.

## Verification

```sh
pnpm check
pnpm test:integration
pnpm openapi:generate
pnpm metadata:check
```

Tests cover input bounds, literal wildcard handling, Unicode, filtering,
pagination, nullable details, decimal precision, barcode normalization/exactness,
status visibility, safe errors, session authorization, read-only runtime grants,
foreign keys, unique barcodes, image constraints, seed repeatability and collisions.
Integration fixtures are synthetic and scoped to the local test database.

Verification at the catalog milestone on September 24, 2026: `pnpm check` passed; 16 unit/API tests,
17 database tests and 37 API integration tests passed (70 total). All three
migrations also applied to an empty isolated schema, the development database
matched the Prisma model, and the seed succeeded on repeated runs. Frozen offline
installation passed without dependency changes.

The subsequent [patient inventory backend](PATIENT-INVENTORY.md) now implements
add, list, edit and archive with quantity/unit, batch, expiry and audit history.
