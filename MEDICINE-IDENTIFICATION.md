# Saydaliyati --- MEDICINE-IDENTIFICATION.md

Version: 1.0

## 1. Goal

Convert a package scan into a verified medicine record.

``` text
Camera
 ↓
Image quality
 ↓
Barcode
 ↓
Exact lookup
 ↓
OCR / vision fallback
 ↓
Candidate matching
 ↓
Confidence
 ↓
User confirmation
 ↓
Inventory
```

## 2. Priority

1.  exact barcode
2.  strong text match
3.  package attributes
4.  image/model candidate ranking
5.  manual search

## 3. Barcode

Supported types should map to:

``` text
EAN13
EAN8
UPC
GTIN
QR
OTHER
```

Barcode values are normalized before lookup.

Do not assume every QR code represents a medicine.

## 4. Image quality

Check:

-   blur
-   glare
-   insufficient lighting
-   package crop
-   readable text
-   barcode visibility

If quality is poor:

> Move closer or improve lighting.

## 5. OCR fields

Candidate extraction may include:

``` text
brand
generic name
strength
form
manufacturer
package quantity
barcode
```

## 6. Matching

Match extracted data against the master medicine catalog.

Use weighted signals:

``` text
barcode      highest
name         high
strength     high
form         medium
manufacturer medium
image        supporting
```

## 7. Confidence

Use structured confidence:

``` text
0.90–1.00 high
0.70–0.89 medium
<0.70 low
```

Thresholds must be validated with real Algerian packaging.

## 8. Confirmation

Never create inventory automatically from an uncertain candidate.

High-confidence UI:

> We found this medicine.

Medium/low:

> Possible match.

## 9. Manual fallback

Always provide:

``` text
Search manually
```

The user can select a catalog medicine.

## 10. Audit

Store identification metadata where useful:

-   source
-   method
-   confidence
-   timestamp
-   confirmed by user

Do not store unnecessary raw images indefinitely.

## 11. API

``` http
GET /api/v1/medicines/barcode/:barcode
POST /api/v1/medicines/identify
```

## 12. Security

-   validate uploads
-   limit file size
-   validate MIME type
-   reject executable content
-   use private object storage
-   authorize image access
-   avoid logging raw package images
