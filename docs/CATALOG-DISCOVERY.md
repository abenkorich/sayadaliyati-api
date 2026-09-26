# Medicine images, categories and suggestions

The `20260925000500_catalog_images_categories` migration adds nullable
`medicines.box_image_url` and `medicines.category_id`, plus `medicine_categories`.
The migration is applied to the connected remote development database. Existing
medicine IDs and patient links are unchanged. Existing reviewed FRONT/PACKAGE
image records are reused where available; missing images remain NULL.

Box images must be HTTPS URLs. Catalog summaries/details and inventory medicine
summaries return `boxImageUrl` and a nullable `category` object (id, slug, name).
Web and Expo catalog, stock and search-result components render an image or a
placeholder, including when an image fails to load.

Ten initial therapeutic categories are available. No medicines are clinically
classified by inference. Records remain Uncategorized until a reviewed category
is assigned. Dosage form remains a separate existing field.

- `GET /api/v1/medicines/categories`: authenticated category list.
- `GET /api/v1/medicines?category=<uuid>`: category filter.
- `GET /api/v1/medicines?category=uncategorized`: unassigned records.
- `GET /api/v1/medicines/suggestions?q=<text>`: public active-catalog identities,
  at least two characters, maximum six results, 120 requests per minute per IP.
  Optional category filtering is supported. Other query controls are rejected.

Suggestions preserve exact medicine strength/form so selecting a similarly named
product is explicit. Both clients debounce by 300ms, ignore stale responses, and
support selecting an existing catalog identity. Web supports arrow keys, Enter
and Escape. Prescription search uses the same component. The public web directory
proxies only a fixed suggestion endpoint and sends selections through sign-in.

## Assigning reviewed metadata

This change does not create an upload service or expose catalog writes to patients.
Use an authorized database administration connection to set metadata. For example,
in a parameterized query with `$1` as HTTPS image URL (or NULL), `$2` as a reviewed
category slug (or NULL), and `$3` as the existing medicine UUID:

```sql
UPDATE medicines
SET box_image_url = $1,
    category_id = (SELECT id FROM medicine_categories WHERE slug = $2),
    updated_at = now()
WHERE id = $3;
```

Check the category exists before applying changes. Set a NULL category explicitly
to clear it. Do not infer categories from product names or replace medicine IDs.
MIPH reimports preserve image and category metadata.

## Release and verification

Deploy/restart the API with the updated generated Prisma client before deploying
the clients; the schema migration alone does not activate the new endpoints.
Web browser regression tests cover placeholders, stale suggestions, keyboard
selection, category filtering and prescription linking on desktop and phone sizes.
Android bundling and TypeScript checks verify the native client. No package box
images or medicine category assignments were fabricated.

## Full MIPH directory data

The existing import already stores every source column and Excel number format in
`medicines.source_metadata`, plus sheet, row and source URL. Complete workbooks,
including quarantined rows, remain in `medicine_imports.snapshot`. No reimport or
schema migration is needed for the expanded directory. Quarantined rows are not
silently promoted to canonical medicines.

Medicine detail and barcode responses now include `miph`: source provenance and a
`fields` array containing each original column's name, scalar value, number format
and display value. Nulls and zero values are retained. Explicit Excel percentages
are formatted for display without overwriting the original numeric value. All
original fields, including unknown future columns, remain visible in the web and
mobile detail views. MIPH codes, TYPE, STATUT, P1 and P2 remain source values; no
unverified clinical meanings or category mappings are inferred.

Authenticated `GET /api/v1/medicines/filters` lists registration holders, their
countries and dosage forms. Catalog queries support exact `laboratory`,
`holderCountry`, `dosageForm`, `barcode`, and `regulatoryStatus` filters. They
intersect with category, manufacturer, ingredient and free-text search.
`status=ALL` explicitly includes inactive/archived records; the default stays
ACTIVE. Use `status=ALL&regulatoryStatus=WITHDRAWN` (or NOT_RENEWED) to browse
historical registrations.

Free text `q` now searches medicine names, ingredients, category names,
manufacturer names, registration holders, holder countries, registration numbers,
strength, form, route, packaging and selected original MIPH fields (CODE, LISTE,
TYPE, STATUT, P1, P2, OBS, stability and withdrawal reason). Text searches are
case-insensitive literal substrings. Stored barcode matching is exact and retains
case and leading zeros. A MIPH nomenclature CODE is not a package barcode.
The official workbook contains no package-barcode column or named therapeutic
category column, so those require reviewed enrichment in the existing tables.

Public suggestions accept the laboratory, holder-country and dosage-form filters
alongside category, but remain limited to six ACTIVE records. Directory clients
turn off suggestions while browsing historical/all records and use the full
catalog search. Source metadata appears on detail responses only.

Deploy the API before the web/mobile updates. Verification covers PostgreSQL
search/filter intersections, literal LIKE metacharacters, exact barcode matching,
all-field projections, desktop/phone browser navigation, and Android bundling.
The older catalog integration assertion that the runtime role cannot update any
medicine is incompatible with the current scoped admin UPDATE grant; it is an
existing separate permission-test issue, not a change to privileges in this work.
