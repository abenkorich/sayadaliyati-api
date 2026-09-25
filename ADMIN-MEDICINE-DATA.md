# Saydaliyati --- ADMIN-MEDICINE-DATA.md

Version: 1.0

## 1. Purpose

Provide controlled administration of the medicine master catalog.

## 2. Roles

Only authorized administrators can modify master medicine data.

## 3. Core workflow

``` text
Import
 ↓
Raw staging
 ↓
Normalization
 ↓
Validation
 ↓
Duplicate detection
 ↓
Review
 ↓
Approve
 ↓
Publish
```

## 4. Never

Do not import external data directly over production records.

## 5. Medicine record

Admin should manage:

-   name
-   generic name
-   strength
-   form
-   manufacturer
-   ingredients
-   package information
-   barcodes
-   images
-   status
-   source metadata

## 6. Versioning

Prefer controlled updates.

Historical records should remain traceable.

Master medicine records should normally be archived rather than hard
deleted.

## 7. Import review

Admin UI should expose:

``` text
new
changed
duplicate
invalid
needs review
approved
rejected
```

## 8. Data provenance

Track:

``` text
source
source version
import timestamp
normalization version
reviewer
approval timestamp
```

## 9. Audit

All sensitive master-data changes must be audited.

## 10. Future capabilities

-   barcode correction
-   duplicate merge
-   manufacturer merge
-   ingredient normalization
-   package-image management
-   import rollback
