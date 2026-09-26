# Admin JSON and CSV transfers

Open `/admin` → **Import & Export** in the web portal. Available datasets:
users, medicines, doctors, pharmacies, hospitals, and settings. Subscriptions are
still planned. These files cover the fields managed by the admin console, not a
complete database backup or export of patient medical records.

## Export

Choose a dataset and JSON or CSV, optionally filter by medicine/generic/category name,
directory name/city, or user email/phone, then select Download. The export includes
all matching rows (not just the current admin list page), capped at 50,000 records.
Larger results produce an explicit error asking for a narrower filter. Empty results
produce an empty JSON array or a CSV header. Actual exports are audited.

CSV is UTF-8 with BOM, quoted fields and CRLF record separators; quoted newlines,
commas and double quotes are supported. Potential spreadsheet formulas and literal
leading apostrophes are escaped with an apostrophe. The CSV importer reverses this
exporter escape. For third-party CSV that intentionally contains a leading apostrophe
before a formula-like value, use JSON to avoid ambiguous spreadsheet conventions.

## Import

1. Download a template or start from an exported file. JSON templates contain one
   blank record; fill required values. CSV templates contain the header only.
2. Select a `.json` or `.csv` file (format is inferred from the filename). JSON must
   contain an array of objects. Maximum 512 KiB UTF-8 and 500 records per batch.
3. Preview the import. File, field and logical-record errors are shown; no records
   change. Valid previews show create/update/unchanged totals and the first ten rows.
4. Confirm the import. All changes and audit entries commit together, or none do.

Existing IDs update matching records in the selected dataset. Omitted/empty IDs
create medicines/directory entries. Unknown or duplicate IDs are errors. Matching
never uses names; existing rows are not deleted. Keep IDs when reimporting exports.
Split exports exceeding import limits into smaller batches, preserving CSV headers.

Users require an existing ID. Only status can change; roles, email/phone, dates,
passwords, sessions and clinical data cannot be imported. Exported read-only fields
may be supplied unchanged. Administrators are protected; PENDING_VERIFICATION may
remain unchanged but cannot be assigned by import. Suspending/disabling revokes
sessions. New account creation continues through the existing registration workflow.

Medicines require name, status and source for new rows, plus nullable genericName,
strength and dosageForm. Existing null sources can be preserved. Directory rows use
name, specialty, licenseNumber, address, city, phone, email and status (DRAFT, ACTIVE,
ARCHIVED). They remain directory entries, not new professional login accounts.
Settings requires exactly one complete record: organizationName, supportEmail,
defaultLanguage (EN/FR/AR) and an IANA timezone.

Preview tokens bind the administrator, dataset, exact file content/format and current
target state. New confirmations expire after 15 minutes. Changed targets require a
new preview. Serializable transactions prevent partial/concurrent writes. A durable
receipt makes repeated confirmations of the same signed token idempotent, including
recovery after an uncertain connection result. A new preview of an ID-less file is a
new import and can create new records; use exported IDs for later updates.

## API and deployment

- GET `/api/v1/admin/transfers/:dataset/export?format=json|csv&q=...&template=false`
- POST `/api/v1/admin/transfers/:dataset/preview`: `{ format, content }`
- POST `/api/v1/admin/transfers/:dataset/apply`: `{ format, content, token }`

All endpoints require active ADMIN authorization. Web requests retain HttpOnly
sessions, account-generation binding, exact-Origin CSRF enforcement and private
no-store responses. Only transfer routes accept a larger 4 MiB JSON transport
body for encoded file contents; ordinary API and web JSON requests remain 16 KiB.
The decoded file limit is still 512 KiB.

Apply migration `20260926000100_admin_transfer_receipts` before starting the updated
API. Grant its runtime role SELECT and INSERT on `admin_transfer_receipts`, alongside
existing admin grants. The local grant script includes these privileges; remote
operators must apply equivalent grants to the actual runtime role. Receipts store
only a hash, actor, dataset, changed-row count and timestamp, never uploaded files.
Normal audit and receipt retention policies should be applied by the operator.

No remote database migration, grants, import, or deployment was performed by this
task. The receipt migration and integration tests ran against the isolated local
test database only.

## Verification

Parser tests cover JSON/CSV Unicode round-trips, quoted/multiline text, formula
escaping, nulls, malformed headers/quotes, unknown fields, row/byte limits and
non-admin denial. Database integration covers preview without writes, persistence,
audits, retry/concurrent confirmation, stale previews, cross-dataset IDs, user
protection, session revocation, settings round-trips and a 150-row import. Browser
checks use synthetic data on desktop and Pixel 7 Chromium, including downloads,
confirmation/cancel, validation failures, oversized files, stale previews and layout.

Verified with Node 24.21.0: 55 API unit tests, 10 admin database integration tests,
30 web unit/session tests (including real local Redis), and 8 admin browser tests
passed. API/web builds, typechecks, API lint and Prisma validation passed. Web lint
passed with the existing registration test configuration warning.

## Complete medicine records

Medicine exports now include all catalog details: brand/generic names, strength,
dosage form, route, packaging, category, manufacturer, registration and regulatory
fields, country, description, box image, source/version/checksum/date, original
source metadata, ingredients, barcodes and images. Source metadata preserves every
original MIPH column under `sourceMetadata.raw`. Patient stock, prescriptions,
treatments and import-run snapshots are separate datasets and are not included.

Category uses `categoryId`, `categorySlug` and `categoryName`. Assign an existing
category by ID, slug or unique name; supply its exact descriptors when including
more than one field. To create a category, leave ID empty and supply both slug and
name. Existing shared categories are not renamed. Clear all three category fields
to remove the assignment. Export search also matches category names.

Manufacturer uses `manufacturerId`, `manufacturerName`, `manufacturerCountry` and
`manufacturerWebsite`. Existing records are selected by ID or a unique normalized
name; absent names are created. Supplied details must match existing shared records.
Ingredients similarly use existing IDs or normalized names, creating missing names.
These rules prevent a medicine import from silently rewriting shared vocabulary.

Structured columns `sourceMetadata`, `ingredients`, `barcodes` and `images` contain
native objects/lists in JSON. In CSV, put the same JSON into a quoted cell, doubling
embedded quotes as usual. Start from an export for correct CSV escaping. Example
JSON medicine (synthetic data):

```json
[
  {
    "name": "Example medicine",
    "genericName": null,
    "strength": "10 mg",
    "dosageForm": "Tablet",
    "status": "INACTIVE",
    "source": "manual",
    "categorySlug": "example-category",
    "categoryName": "Example category",
    "manufacturerName": "Example laboratory",
    "manufacturerCountry": "DZ",
    "manufacturerWebsite": "https://example.com",
    "ingredients": [
      {"name": "Example ingredient", "amount": "10", "unit": "mg"}
    ],
    "barcodes": [
      {"barcode": "0012345678901", "barcodeType": "EAN13", "country": "DZ"}
    ],
    "images": [
      {"url": "https://example.com/box.jpg", "imageType": "FRONT", "sortOrder": 0, "source": "manual"}
    ],
    "sourceMetadata": {"raw": {"CODE": "00001", "P1": "", "P2": "0"}}
  }
]
```

Each ingredient can include `ingredientId` and `description`. Amount is a decimal
string or number, nonnegative, with at most eight integer digits and four decimal
places. Keep barcodes as strings to preserve leading zeros. Barcode types: EAN13,
EAN8, UPC, GTIN, QR, OTHER. Image types: FRONT, BACK, SIDE, PACKAGE, OTHER. Image and
box-image URLs must be HTTPS. Only links are transferred; image files are not
uploaded or downloaded. Each relation list supports up to 100 entries per medicine.

Optional detail fields/columns omitted from an import preserve existing values.
Explicit nulls or blank CSV cells clear nullable details; null or `[]` replaces a
relation list with an empty list. Supplied lists replace that medicine’s links
atomically. Missing fields default to null or empty lists for new medicines. The
original seven-column format remains supported and does not erase extended details.

`normalizedName`, `createdAt` and `updatedAt` are exported for reference and read-only.
For updates, keep exported values unchanged or omit these columns. Empty CSV cells
in these three columns are ignored. Newly created rows receive server timestamps
and a derived normalized name. Images/barcode link IDs and relationship timestamps
are internal identities and are not imported; ingredient IDs refer to shared records.

Regulatory status is null, CURRENT, NOT_RENEWED or WITHDRAWN. WITHDRAWN/NOT_RENEWED
medicines cannot be ACTIVE, including when regulatory status was omitted and is
preserved from the existing row. MIPH registration numbers and barcodes must remain
unique; imports never take barcodes from another medicine. Preview reports unknown
references, ambiguous names, inconsistent shared definitions and duplicate identifiers.
Signed previews also bind referenced catalog records; concurrent changes require a
new preview. All record, relation, shared vocabulary and audit writes are atomic.

Deploy the updated API and web portal and apply
`20260926000600_full_medicine_transfers` before using extended imports. This migration
adds catalog permissions for the existing `saydaliyati_app` role, if present. For a
custom runtime role, apply equivalent SELECT/INSERT grants on categories,
manufacturers and active ingredients, INSERT/UPDATE on medicines, and INSERT/DELETE
on medicine ingredients/barcodes/images, in addition to existing SELECT grants.
No production migration or deployment was performed by this change.
