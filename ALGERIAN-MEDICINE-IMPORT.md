# Saydaliyati --- ALGERIAN-MEDICINE-IMPORT.md

Version: 1.0

## 1. Goal

Build a reliable Algeria-focused medicine master catalog using
authoritative sources where legally and technically permitted.

## 2. Pipeline

``` text
Official source
 ↓
Raw download
 ↓
Raw staging
 ↓
Normalization
 ↓
Manufacturer normalization
 ↓
Ingredient normalization
 ↓
Package normalization
 ↓
Barcode normalization
 ↓
Duplicate detection
 ↓
Validation
 ↓
Review
 ↓
Production
```

## 3. Source priority

Prefer:

1.  official Algerian pharmaceutical sources
2.  authoritative manufacturer data
3.  verified structured sources
4.  secondary sources only for enrichment/verification

Do not represent a secondary source as official.

## 4. Raw layer

Keep immutable raw import snapshots where permitted.

Store:

``` text
source
source version
retrieved timestamp
checksum
raw file reference
```

## 5. Normalization

Normalize:

-   names
-   accents
-   Arabic/French/Latin representations
-   manufacturer names
-   ingredients
-   strengths
-   forms
-   package sizes
-   barcodes

Do not destroy the original source value.

## 6. Duplicate detection

Potential duplicate signals:

``` text
same barcode
same manufacturer + product + strength + form
same normalized pharmaceutical identity
```

Duplicates require review when ambiguous.

## 7. Validation

Reject or flag:

-   missing medicine name
-   invalid strength
-   invalid barcode
-   impossible package quantity
-   unknown manufacturer
-   conflicting ingredient data

## 8. Publication

Only approved records enter the production catalog.

## 9. Updates

Imports must support:

``` text
new
updated
unchanged
retired
```

Never blindly overwrite user inventory references.

## 10. Compliance

Before production use, verify:

-   source licensing/usage rights
-   applicable Algerian pharmaceutical requirements
-   personal-data requirements
-   retention requirements
