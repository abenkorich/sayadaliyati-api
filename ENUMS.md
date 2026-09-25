# Saydaliyati --- ENUMS.md

Version: 1.0

## User

``` sql
CREATE TYPE user_role AS ENUM (
  'PATIENT',
  'DOCTOR',
  'PHARMACY',
  'ADMIN'
);

CREATE TYPE user_status AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'DISABLED',
  'PENDING_VERIFICATION'
);
```

## Language

``` sql
CREATE TYPE language_code AS ENUM (
  'EN',
  'FR',
  'AR'
);
```

## Professional verification

``` sql
CREATE TYPE verification_status AS ENUM (
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED'
);
```

## Medicine

``` sql
CREATE TYPE medicine_status AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

CREATE TYPE barcode_type AS ENUM (
  'EAN13',
  'EAN8',
  'UPC',
  'GTIN',
  'QR',
  'OTHER'
);

CREATE TYPE medicine_image_type AS ENUM (
  'FRONT',
  'BACK',
  'SIDE',
  'PACKAGE',
  'OTHER'
);
```

## Inventory

```sql
CREATE TYPE inventory_unit AS ENUM (
  'TABLET', 'CAPSULE', 'ML', 'MG', 'G', 'DOSE', 'SACHET', 'AMPOULE', 'VIAL', 'SUPPOSITORY', 'DROP', 'PATCH', 'OTHER'
);
```

``` sql
CREATE TYPE inventory_source AS ENUM (
  'MANUAL',
  'SCAN',
  'PRESCRIPTION',
  'IMPORT',
  'OTHER'
);
```

## Prescription

``` sql
CREATE TYPE prescription_source AS ENUM (
  'SCANNED',
  'MANUAL',
  'SHARED',
  'DIGITAL'
);

CREATE TYPE prescription_status AS ENUM (
  'DRAFT',
  'CONFIRMED',
  'ARCHIVED'
);

CREATE TYPE ocr_processing_status AS ENUM (
  'UPLOADED', 'QUEUED', 'PROCESSING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED'
);

CREATE TYPE extraction_source AS ENUM ('OCR', 'AI', 'USER', 'PROFESSIONAL');

CREATE TYPE extraction_confirmation_status AS ENUM (
  'PENDING',
  'CONFIRMED',
  'REJECTED'
);
```

## Treatment

``` sql
CREATE TYPE treatment_status AS ENUM (
  'PLANNED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE schedule_type AS ENUM ('FIXED_TIMES');

CREATE TYPE medication_event_status AS ENUM (
  'TAKEN',
  'MISSED',
  'SKIPPED'
);
```

## Professional connections

``` sql
CREATE TYPE connection_status AS ENUM (
  'PENDING',
  'ACTIVE',
  'REVOKED'
);
```

## Sharing

``` sql
CREATE TYPE share_recipient_type AS ENUM ('DOCTOR', 'PHARMACY');

-- ShareSession lifecycle is derived from consumed_at, cancelled_at,
-- expires_at and counters. AccessGrant has independent expiry/revocation.

CREATE TYPE share_permission AS ENUM (
  'READ_MEDICATIONS',
  'READ_INVENTORY',
  'READ_EXPIRY',
  'READ_PRESCRIPTIONS',
  'READ_TREATMENTS',
  'READ_HISTORY'
);
```

## Community — FUTURE (not part of baseline enum migrations)

``` sql
CREATE TYPE medication_request_status AS ENUM (
  'OPEN',
  'FULFILLED',
  'CANCELLED',
  'EXPIRED'
);
```

## Notifications

``` sql
CREATE TYPE notification_type AS ENUM (
  'DOSE_DUE',
  'DOSE_MISSED',
  'EXPIRY',
  'LOW_STOCK',
  'PRESCRIPTION',
  'SHARING',
  'SYSTEM'
);
```

## Enum policy

Stable workflow states may use PostgreSQL enums.

Values that may become admin-configurable, heavily localized, or
frequently expanded should be considered for lookup tables instead.

## Deferred vocabulary

INTERVAL and AS_NEEDED schedules, and CAREGIVER and FAMILY recipients, are future
concepts only. They are not accepted by V1 APIs or included in baseline enums.
`extraction_confirmation_status` remains a medication-level review summary;
field revisions also record their own `confirmed` value and provenance.
Inventory codes are machine values; localized labels such as “capsules” are UI only.
