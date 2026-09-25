# Saydaliyati --- PRESCRIPTION-OCR.md

Version: 1.0

## 1. Purpose

Transform a prescription image into structured candidate medication
instructions that the user explicitly reviews.

## 2. Pipeline

``` text
Upload
 ↓
File validation
 ↓
Image quality
 ↓
OCR
 ↓
Medical entity extraction
 ↓
Medicine matching
 ↓
Dose extraction
 ↓
Frequency extraction
 ↓
Duration extraction
 ↓
Confidence
 ↓
User review
 ↓
Confirmation
 ↓
Prescription
 ↓
Treatment
```

## 3. Supported fields

``` text
medicine
strength
form
dose
dose unit
frequency
scheduled times
duration
start date
end date
instructions
```

## 4. Handwriting

Handwritten prescriptions are high-risk.

Uncertain handwriting must be presented for explicit confirmation.

Never silently guess a dose.

## 5. Confidence

Field-level confidence and confirmation are required. Summary confidence may also exist at:

``` text
document
medication
field
```

Example:

``` text
Medicine: high
Strength: high
Frequency: low
Duration: medium
```

## 6. Review screen

Show original document alongside extracted fields.

Each uncertain field must be editable.

## 7. Confirmation states

``` text
PENDING
CONFIRMED
REJECTED
```

A prescription should not become an active treatment until required
fields are confirmed.

## 8. API

``` http
POST /api/v1/me/prescriptions/scan
GET /api/v1/me/prescriptions/:id
PATCH /api/v1/me/prescriptions/:id
```

## 9. Async processing

BullMQ workers perform long OCR processing. The approved processing states are:

```text
UPLOADED → QUEUED → PROCESSING → REVIEW_REQUIRED → COMPLETED
FAILED (safe representation of upload/queue/processing failure)
```

Scan returns HTTP 202 after accepting QUEUED work; poll prescription detail.
Independent prescription business states are DRAFT, CONFIRMED, ARCHIVED. Manual
entry has null processingStatus. Explicit completed review can set business
CONFIRMED and processing COMPLETED atomically; it never activates a treatment.
Failed processing never fabricates results. Reprocessing/retry policy remains
open before OCR implementation and cannot overwrite confirmed history silently.

## 10. Security

Prescription images are sensitive.

-   private storage
-   signed temporary access URLs
-   authorization on every download
-   retention policy
-   no public object URLs
-   no raw OCR text in ordinary logs

## 11. Failure

If OCR fails:

> We couldn't read this prescription.

Offer:

``` text
Try another photo
Enter manually
```

Never fabricate an extraction.

## 12. Field provenance and multi-page persistence

Use prescription_documents and append-only prescription_extracted_fields revisions
as specified in TABLES.md section 32. Sources: OCR, AI, USER, PROFESSIONAL. Edits
append typed revisions, retain original values/provenance, and record confirmation
actor/time. Do not create a scalar column for every possible OCR field. Existing
medication columns are synchronized projections and cannot bypass field review.

Unknown prescribed quantity stays null; known quantity must be positive. Never
silently guess handwriting. Required review fields for each regimen remain a
pre-OCR/treatment decision. Each document has ownership, order, storage key, MIME,
processing and retention metadata; validate all required pages. Authorize downloads
and issue only short-lived signed URLs; no public object URLs or raw OCR logs.
Retention durations require approval before production.

## Implemented manual review subset

D020 defines explicit finalization for complete manually reviewed daily regimens
and the fixed-time treatment backend. See docs/TREATMENTS.md. This does not
select an OCR provider, guess handwriting or approve machine-derived candidates.
