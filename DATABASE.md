# Database Specification

PostgreSQL is the source of truth for transactional application data.

## 1. Users

### users

-   id UUID PK
-   email nullable
-   phone nullable
-   password_hash
-   role: PATIENT \| DOCTOR \| PHARMACY \| ADMIN
-   status
-   created_at
-   updated_at

### patient_profiles

-   user_id PK/FK users.id
-   first_name
-   last_name
-   date_of_birth nullable
-   preferred_language
-   timezone

### doctor_profiles

-   user_id PK/FK users.id
-   professional_number
-   first_name
-   last_name
-   specialty
-   organization_name
-   verification_status
-   verified_at

### pharmacy_profiles

-   user_id PK/FK users.id
-   pharmacy_name
-   registration_number
-   address
-   city
-   wilaya
-   latitude nullable
-   longitude nullable
-   phone
-   verification_status
-   verified_at

## 2. Medicine master data

### medicines

-   id UUID PK
-   name
-   brand_name nullable
-   generic_name nullable
-   strength nullable
-   dosage_form nullable
-   route nullable
-   package_size nullable
-   manufacturer_id nullable
-   registration_number nullable
-   status
-   country
-   description nullable
-   created_at
-   updated_at

### active_ingredients

-   id UUID PK
-   name
-   normalized_name
-   description nullable

### medicine_ingredients

-   medicine_id FK
-   ingredient_id FK
-   amount nullable
-   unit nullable
-   PK(medicine_id, ingredient_id)

### manufacturers

-   id UUID PK
-   name
-   country nullable
-   website nullable

### medicine_images

-   id UUID PK
-   medicine_id FK
-   url
-   image_type
-   sort_order

### medicine_barcodes

-   id UUID PK
-   medicine_id FK
-   barcode
-   barcode_type
-   country nullable
-   unique(barcode)

## 3. Patient inventory

### medication_inventory

-   id UUID PK
-   patient_id FK users.id
-   medicine_id FK medicines.id
-   quantity numeric >= 0
-   unit inventory_unit NOT NULL
-   archived_at nullable timestamptz
-   low_stock_threshold nullable numeric >= 0 (same inventory unit)
-   batch_number nullable
-   expiry_date nullable
-   purchase_date nullable
-   storage_location nullable
-   source nullable
-   notes nullable
-   created_at
-   updated_at

A single medicine may have multiple inventory records when batches or
expiry dates differ.

## 4. Prescriptions

### prescriptions

-   id UUID PK
-   patient_id FK
-   doctor_id nullable FK
-   prescription_date nullable
-   valid_until nullable
-   source
-   processing_status ocr_processing_status nullable (manual entry has no OCR job)
-   documents: ordered prescription_documents relationship; no single image URL
-   status
-   created_at
-   updated_at

### prescription_medications

-   id UUID PK
-   prescription_id FK
-   medicine_id nullable FK
-   extracted_name nullable
-   dosage nullable
-   dosage_unit nullable
-   frequency nullable
-   frequency_unit nullable
-   duration nullable
-   duration_unit nullable
-   quantity nullable; when supplied, > 0; unknown stays null, never zero
-   instructions nullable
-   confidence nullable
-   confirmation_status

OCR extraction must not be considered confirmed until user confirmation.

## 5. Treatments

### treatments

-   id UUID PK
-   patient_id FK
-   prescription_id nullable FK
-   name
-   start_date
-   end_date nullable
-   status: PLANNED \| ACTIVE \| PAUSED \| COMPLETED \| CANCELLED

### treatment_medications

-   id UUID PK
-   treatment_id FK
-   medicine_id FK
-   dose
-   dose_unit
-   frequency nullable
-   schedule_type
-   duration nullable
-   duration_unit nullable
-   instructions nullable

### medication_schedules

-   id UUID PK
-   treatment_medication_id FK
-   time
-   timezone (validated IANA timezone captured from profile)
-   days_of_week nullable
-   start_date
-   end_date nullable
-   enabled

### medication_events

-   id UUID PK
-   occurrence_id UUID FK medication_occurrences.id UNIQUE NOT NULL
-   patient_id FK
-   treatment_medication_id FK
-   scheduled_at
-   recorded_at nullable
-   status: TAKEN \| MISSED \| SKIPPED

## 6. Sharing

### doctor_connections — FUTURE relationship metadata, not access authority

-   id UUID PK
-   patient_id FK
-   doctor_id FK
-   status: PENDING \| ACTIVE \| REVOKED
-   created_at
-   updated_at

### share_sessions

Short-lived code bootstrap, never ongoing access. Canonical fields:

- id UUID PK
- patient_id FK users.id
- recipient_type: DOCTOR | PHARMACY
- code_hash (never plaintext)
- created_at, expires_at
- consumed_at nullable, cancelled_at nullable
- max_attempts, failed_attempts
- max_uses, use_count
- grant_expires_at nullable: patient-approved expiry copied into grants
- requested permissions in share_permissions

A session becomes consumed when its permitted uses are exhausted. Cancellation
and code expiry prevent redemption only; they do not revoke issued grants.

### share_permissions

- id UUID PK
- share_session_id FK share_sessions.id
- permission share_permission
- created_at
- unique(share_session_id, permission)

### access_grants

- id UUID PK
- patient_id FK users.id
- recipient_user_id FK users.id
- recipient_type: DOCTOR | PHARMACY
- source_share_session_id FK share_sessions.id
- granted_at, expires_at nullable
- revoked_at nullable, revoked_by nullable FK users.id
- permissions in access_grant_permissions

Grant recipient and patient must match the authenticated recipient and source
session. Ongoing reads check recipient, grant expiry/revocation, permission, and
patient ownership. A doctor connection or an audit record is not authority.

### access_grant_permissions

- id UUID PK
- access_grant_id FK access_grants.id
- permission share_permission
- created_at
- unique(access_grant_id, permission)

### share_access_logs

- id UUID PK
- share_session_id nullable FK share_sessions.id
- access_grant_id nullable FK access_grants.id
- patient_id FK users.id
- accessor_id nullable FK users.id (unknown actor on failed attempts)
- action, resource_type nullable
- ip_address nullable, user_agent nullable, created_at

At least one session/grant reference is required. Audit records are not grants.

## 7. Community — FUTURE, excluded from baseline migrations

### medication_requests

-   id UUID PK
-   patient_id FK
-   medicine_id nullable FK
-   quantity nullable
-   city nullable
-   wilaya nullable
-   latitude nullable
-   longitude nullable
-   description nullable
-   status
-   expires_at nullable
-   created_at
-   updated_at

Do not expose precise patient location by default.

## 8. Notifications

### notifications

-   id UUID PK
-   user_id FK
-   type
-   title
-   body
-   data JSONB
-   read_at nullable
-   created_at

## 9. Auditing

### audit_logs

-   id UUID PK
-   actor_id nullable FK
-   action
-   resource_type
-   resource_id nullable
-   metadata JSONB
-   ip_address nullable
-   created_at

## 10. Critical relationships

``` text
Medicine
  ├── Ingredients
  ├── Manufacturer
  ├── Barcodes
  └── Images

Patient
  ├── Inventory --> Medicine
  ├── Prescriptions
  │      └── PrescriptionMedication --> Medicine
  └── Treatments
         └── TreatmentMedication --> Medicine
                └── Schedules
                       └── Events
```

Do not merge Medicine, MedicationInventory and TreatmentMedication.

## 11. Indexing

At minimum index:

-   medicine normalized/search fields
-   barcode
-   patient_id on all patient-owned tables
-   expiry_date
-   treatment status
-   scheduled_at
-   share code hash
-   share expiry
-   audit resource references

Use PostgreSQL full-text search or a dedicated search strategy when
medicine catalog size and language requirements justify it.

## 12. Foundation persistence additions

Exact column types, nullability, and keys are specified in `TABLES.md`.

### sessions

`id`, `user_id`, `refresh_token_hash`, `device_metadata`, `created_at`,
`last_used_at`, `expires_at`, `revoked_at`. Rotation atomically replaces the
verification hash in an active session; no plaintext token is persisted.

### Prescription lifecycle and review

Business `status`: DRAFT | CONFIRMED | ARCHIVED. Independent nullable
`processing_status`: UPLOADED | QUEUED | PROCESSING | REVIEW_REQUIRED | COMPLETED | FAILED.
Manual prescriptions have no OCR processing state. Completion of OCR review
must never activate a treatment automatically.

`prescription_documents` records prescription ownership, page order, private
storage key, MIME type, processing state, and retention/deletion metadata.
`prescription_extracted_fields` holds append-only field revisions: field name,
value, confidence, source (OCR | AI | USER | PROFESSIONAL), confirmed flag and
confirmation actor/time. Medication summary columns are projections, not a
substitute for field review. Unknown prescribed quantity is null.

### Fixed-time schedules and occurrences

Only FIXED_TIMES is in V1. `medication_schedules.timezone` captures the patient's
IANA timezone at creation. Future-effective schedule changes use a new schedule
identity and never rewrite historical occurrences.
`medication_occurrences` has a server-issued UUID, patient, schedule, local date,
timezone, and resolved UTC scheduled time; unique(schedule_id, local_date).
`medication_events.occurrence_id` is unique and references that occurrence.
Retries use occurrence identity, not timestamp equality. See `TABLES.md` for
consistency constraints and the unresolved daylight-saving policy gate.

### notification_preferences

One row per user, with explicit booleans for dose, expiry, low-stock, sharing,
and system notifications, nullable expiry lead time, and timestamps. Product
defaults remain open; no silent opt-in is implied. Low-stock thresholds are
stored per inventory row in its explicit unit. Device push-token registration
is separate and provider-neutral; delivery integration remains a later task.

### Inventory removal

Set `archived_at` to remove an item from the active pharmacy. Default lists,
shared current inventory, and stock calculations exclude archived rows.
Preserve rows and audit history; no cascade into prescriptions, treatments,
medication events, or audit records. Physical purge requires the separately
approved retention/account-deletion process.
