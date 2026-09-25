# MIPH catalog import

This command extracts the official XLSX, preserves its bytes and original row values,
and compares proposed medicine records with a read-only database snapshot by default.
`--apply` imports eligible rows into the local development/test database. Rows with
issues remain excluded and are retained in the import snapshot for review.

Requires the project's Node runtime and Python 3 with
`pip install -r packages/database/scripts/requirements-miph.txt`.
Set `MIPH_PYTHON` to select a Python interpreter if needed.

From the repository root:

```sh
node --env-file=.env packages/database/scripts/import-miph.mjs \
  --file /absolute/path/clean_NOMENCLATURE.VERSION.AOUT_.2026-.xlsx \
  --version 2026-08-31 \
  --source-url https://www.miph.gov.dz/fr/wp-content/uploads/2026/09/clean_NOMENCLATURE.VERSION.AOUT_.2026-.xlsx \
  --out import-artifacts/miph-2026-08
```

Create the parent directory first. The output directory must be new to prevent
overwriting a previous snapshot. `DATABASE_URL` uses the existing SELECT-only
catalog role. `--offline` skips database access; its "new" count means candidates,
not verified new database identities.

Run `pnpm db:migrate` before comparing or importing. Add `--apply` to the command
above to write using `MIGRATION_DATABASE_URL`, with a new output directory.
Use `--apply --rollback` to exercise the full write transaction without committing.
Remote databases, unknown database names and production mode are rejected.
This command is not a production publication mechanism.

Outputs (ignored by git):

- `source.xlsx`: exact input snapshot.
- `staging.json`: source URL, version, SHA-256, staging timestamp, original values,
  sheet/row references, proposed fields and validation issues.
- `report.json`: new, updated, unchanged and review rows, plus existing MIPH
  records absent from the source. Absence never implies deletion or withdrawal.

## Mapping and review

DCI maps verbatim to `genericName`; brand, form, strength and packaging map to
their corresponding existing fields. Search normalization follows the API's NFC,
whitespace and lowercase convention. Country `DZ` describes the catalog market.
The source's holder country is stored separately in `holderCountry`.

Registration holders are not assumed to be manufacturers. No manufacturers,
barcodes, images, ingredient associations, ingredient amounts, routes or clinical
instructions are inferred. Combination DCI and complex presentations stay verbatim.
The workbook's `STATUT` column is preserved raw, not mapped to application status.

Current rows propose ACTIVE; non-renewed and withdrawn rows propose INACTIVE,
with their distinct regulatory status persisted on the medicine. Detail responses
expose regulatory status, registration holder and holder country. Raw values,
Excel number formats, sheet/row and source URL are stored in `sourceMetadata`.
Strength and packaging use TEXT columns so source descriptions are not truncated.
Explicit Excel percentage formats are converted faithfully (0.01 with format 0%
becomes 1%); unitless numbers and strings require review rather than inferred units.

Every occurrence of a repeated registration number is held for review, including
cross-sheet conflicts. Missing required fields, overlong database values, formulas,
Excel errors, and absent holders are also held. Existing database duplicates,
other-source matches and changes to product identity require review. This is
structural validation, not pharmaceutical verification of strengths or packaging.
Candidate rows are not automatically approved for production.

Each apply stores the complete source snapshot and row-level report in
`medicine_imports` and appends an audit event. A transaction and table/advisory locks
cover comparison, upserts, snapshot and audit. A partial unique index enforces one
MIPH medicine per registration number; unresolved package variants are held for
review. Reruns preserve IDs and timestamps of unchanged records. Older releases
are rejected. No missing or ambiguous row deletes an existing medicine. For a
future release, a conflicting existing registration must be reviewed before
publication; quarantine does not silently change its previously imported status.
Follow the production review
requirements in [ALGERIAN-MEDICINE-IMPORT.md](../ALGERIAN-MEDICINE-IMPORT.md).

## August 2026 local import

Imported 8,806 of 9,595 source rows on September 25, 2026:

- 5,081 CURRENT / ACTIVE.
- 1,313 NOT_RENEWED / INACTIVE.
- 2,412 WITHDRAWN / INACTIVE.
- 789 held for review. Issue counts overlap: 625 unitless strengths, 98 duplicate
  registration occurrences, 70 missing strengths, 6 missing packages, 4 missing forms.

The 98 duplicate occurrences include cross-sheet conflicts and package variants;
neither is resolved by picking a first row. Unknown values were not filled in.
Long descriptions were resolved by widening columns. The higher review count than
the first dry run comes from the added unit validation.

Artifacts: `import-artifacts/miph-2026-08-applied/`. A repeat apply found zero new
or updated medicines and 8,806 unchanged. Full-row comparisons verified stable IDs,
values and timestamps. Rollback restored both medicine data and import-history
counts; older-version rejection and brand/DCI searches passed using the real local DB.

## Verification

```sh
node --test packages/database/test/miph-plan.test.mjs
python3 packages/database/test/test_miph_extract.py
pnpm --filter @saydaliyati/database typecheck
```

Tests cover repeated comparisons, duplicate and other-source collisions, identity
changes, explicit withdrawals, absent records, preservation of raw text, formulas,
and registration-holder separation.
