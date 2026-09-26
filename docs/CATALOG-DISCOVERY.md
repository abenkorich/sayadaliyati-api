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
