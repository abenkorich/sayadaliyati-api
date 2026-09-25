# Saydaliyati --- PostgreSQL ERD Specification

Version: 1.0\
Status: Implementation baseline\
Database: PostgreSQL\
ORM: Prisma\
Primary key strategy: UUID\
Timezone: UTC in database; user timezone stored on profile

------------------------------------------------------------------------

# 1. Purpose

This document defines the canonical Saydaliyati relational domain model.

The database must preserve a strict separation between:

1.  **Medicine master data** --- what a pharmaceutical product is.
2.  **Patient inventory** --- what physical medicine a patient
    possesses.
3.  **Prescription medication** --- what a prescription specifies.
4.  **Treatment medication** --- what a patient is actually following as
    part of a treatment.
5.  **Medication schedule** --- when treatment doses are expected.
6.  **Medication event** --- what actually happened with a scheduled
    dose.

This separation is fundamental to Saydaliyati.

------------------------------------------------------------------------

# 2. High-Level ERD

``` mermaid
erDiagram

    USERS ||--o| PATIENT_PROFILES : has
    USERS ||--o| DOCTOR_PROFILES : has
    USERS ||--o| PHARMACY_PROFILES : has

    MANUFACTURERS ||--o{ MEDICINES : manufactures
    MEDICINES ||--o{ MEDICINE_INGREDIENTS : contains
    ACTIVE_INGREDIENTS ||--o{ MEDICINE_INGREDIENTS : included_in
    MEDICINES ||--o{ MEDICINE_BARCODES : identified_by
    MEDICINES ||--o{ MEDICINE_IMAGES : has

    USERS ||--o{ MEDICATION_INVENTORY : owns
    MEDICINES ||--o{ MEDICATION_INVENTORY : stocked_as

    USERS ||--o{ PRESCRIPTIONS : owns
    DOCTOR_PROFILES ||--o{ PRESCRIPTIONS : writes
    PRESCRIPTIONS ||--o{ PRESCRIPTION_MEDICATIONS : contains
    MEDICINES ||--o{ PRESCRIPTION_MEDICATIONS : references

    USERS ||--o{ TREATMENTS : follows
    PRESCRIPTIONS ||--o{ TREATMENTS : may_create
    TREATMENTS ||--o{ TREATMENT_MEDICATIONS : contains
    MEDICINES ||--o{ TREATMENT_MEDICATIONS : uses
    TREATMENT_MEDICATIONS ||--o{ MEDICATION_SCHEDULES : scheduled_by
    TREATMENT_MEDICATIONS ||--o{ MEDICATION_EVENTS : produces
    USERS ||--o{ MEDICATION_EVENTS : records


    USERS ||--o{ SHARE_SESSIONS : creates
    SHARE_SESSIONS ||--|{ SHARE_PERMISSIONS : requests
    SHARE_SESSIONS |o--o{ SHARE_ACCESS_LOGS : records
    USERS |o--o{ SHARE_ACCESS_LOGS : accessor


    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ AUDIT_LOGS : performs
  USERS ||--o{ SESSIONS : authenticates
  USERS ||--o| NOTIFICATION_PREFERENCES : configures
  PRESCRIPTIONS ||--o{ PRESCRIPTION_DOCUMENTS : includes
  PRESCRIPTION_MEDICATIONS ||--o{ PRESCRIPTION_EXTRACTED_FIELDS : reviews
  MEDICATION_SCHEDULES ||--o{ MEDICATION_OCCURRENCES : generates
  MEDICATION_OCCURRENCES ||--o| MEDICATION_EVENTS : records
  SHARE_SESSIONS ||--o{ ACCESS_GRANTS : bootstraps
  USERS ||--o{ ACCESS_GRANTS : owns_or_receives
  ACCESS_GRANTS ||--|{ ACCESS_GRANT_PERMISSIONS : scopes
  ACCESS_GRANTS |o--o{ SHARE_ACCESS_LOGS : audits
```

------------------------------------------------------------------------

# 3. Identity and Profiles

## 3.1 users

Purpose: authentication identity and global role.

  Column              Type             Null Rules
  ------------------- -------------- ------ ----------------------------
  id                  uuid               NO PK
  email               varchar(320)      YES unique when present
  phone               varchar(32)       YES unique when present
  password_hash       text              YES required for password auth
  role                user_role          NO default PATIENT
  status              user_status        NO default ACTIVE
  created_at          timestamptz        NO default now()
  updated_at          timestamptz        NO default now()
  last_login_at       timestamptz       YES 
  email_verified_at   timestamptz       YES 
  phone_verified_at   timestamptz       YES 

### Rules

-   At least one login identifier must exist.
-   Email is normalized before uniqueness comparison.
-   Phone is stored in normalized international format where possible.
-   Password hashes must never be reversible.
-   Role changes are audited.

------------------------------------------------------------------------

## 3.2 patient_profiles

Purpose: patient-specific profile data.

  Column               Type              Null Rules
  -------------------- --------------- ------ ----------------
  user_id              uuid                NO PK/FK users.id
  first_name           varchar(100)        NO 
  last_name            varchar(100)        NO 
  date_of_birth        date               YES 
  preferred_language   language_code       NO default EN
  timezone             varchar(64)         NO default UTC
  created_at           timestamptz         NO 
  updated_at           timestamptz         NO 

Do not store calculated age. Calculate it from date_of_birth when
required.

------------------------------------------------------------------------

## 3.3 doctor_profiles

  Column                Type                    Null Rules
  --------------------- --------------------- ------ ----------------------
  user_id               uuid                      NO PK/FK users.id
  professional_number   varchar(100)             YES unique where present
  first_name            varchar(100)              NO 
  last_name             varchar(100)              NO 
  specialty             varchar(150)             YES 
  organization_name     varchar(200)             YES 
  verification_status   verification_status       NO default PENDING
  verified_at           timestamptz              YES 
  created_at            timestamptz               NO 
  updated_at            timestamptz               NO 

Professional verification must be a separate workflow and must not be
inferred solely from a user-selected role.

------------------------------------------------------------------------

## 3.4 pharmacy_profiles

  Column                Type                    Null Rules
  --------------------- --------------------- ------ ----------------------
  user_id               uuid                      NO PK/FK users.id
  pharmacy_name         varchar(200)              NO 
  registration_number   varchar(100)             YES unique where present
  address               text                     YES 
  city                  varchar(100)             YES 
  wilaya                varchar(100)             YES 
  latitude              numeric(9,6)             YES 
  longitude             numeric(9,6)             YES 
  phone                 varchar(32)              YES 
  verification_status   verification_status       NO default PENDING
  verified_at           timestamptz              YES 
  created_at            timestamptz               NO 
  updated_at            timestamptz               NO 

Precise pharmacy coordinates may be stored for pharmacy discovery; they
must not be exposed as patient location data.

------------------------------------------------------------------------

# 4. Medicine Master Data

## 4.1 manufacturers

  Column            Type             Null Rules
  ----------------- -------------- ------ ---------
  id                uuid               NO PK
  name              varchar(255)       NO 
  normalized_name   varchar(255)       NO indexed
  country           varchar(100)      YES 
  website           varchar(500)      YES 
  created_at        timestamptz        NO 
  updated_at        timestamptz        NO 

------------------------------------------------------------------------

## 4.2 medicines

Purpose: canonical pharmaceutical product.

  Column                Type                Null Rules
  --------------------- ----------------- ------ ----------------
  id                    uuid                  NO PK
  name                  varchar(255)          NO display name
  normalized_name       varchar(255)          NO indexed
  brand_name            varchar(255)         YES 
  generic_name          varchar(255)         YES indexed
  strength              varchar(100)         YES 
  dosage_form           varchar(100)         YES 
  route                 varchar(100)         YES 
  package_size          varchar(100)         YES 
  manufacturer_id       uuid                 YES FK
  registration_number   varchar(150)         YES 
  status                medicine_status       NO default ACTIVE
  country               varchar(100)         YES 
  description           text                 YES 
  source                varchar(150)         YES provenance
  source_version        varchar(100)         YES provenance
  source_updated_at     timestamptz          YES provenance
  created_at            timestamptz           NO 
  updated_at            timestamptz           NO 

### Important

A `medicine` represents a catalog product, not a patient's physical
stock.

------------------------------------------------------------------------

## 4.3 active_ingredients

  Column            Type             Null Rules
  ----------------- -------------- ------ ----------------
  id                uuid               NO PK
  name              varchar(255)       NO 
  normalized_name   varchar(255)       NO unique/indexed
  description       text              YES 
  created_at        timestamptz        NO 
  updated_at        timestamptz        NO 

------------------------------------------------------------------------

## 4.4 medicine_ingredients

Many-to-many relationship.

  Column          Type              Null Rules
  --------------- --------------- ------ -------
  medicine_id     uuid                NO FK
  ingredient_id   uuid                NO FK
  amount          numeric(12,4)      YES 
  unit            varchar(50)        YES 
  created_at      timestamptz         NO 

Primary key:

``` text
(medicine_id, ingredient_id)
```

------------------------------------------------------------------------

## 4.5 medicine_barcodes

  Column         Type             Null Rules
  -------------- -------------- ------ --------
  id             uuid               NO PK
  medicine_id    uuid               NO FK
  barcode        varchar(100)       NO unique
  barcode_type   barcode_type       NO 
  country        varchar(10)       YES 
  created_at     timestamptz        NO 

Barcode values must be normalized before lookup.

------------------------------------------------------------------------

## 4.6 medicine_images

  Column        Type                    Null Rules
  ------------- --------------------- ------ -----------
  id            uuid                      NO PK
  medicine_id   uuid                      NO FK
  url           text                      NO 
  image_type    medicine_image_type       NO 
  sort_order    integer                   NO default 0
  source        varchar(150)             YES 
  created_at    timestamptz               NO 

Images should be stored in object storage, not PostgreSQL binary fields.

------------------------------------------------------------------------

# 5. Patient Medication Inventory

## 5.1 medication_inventory

Purpose: physical medicine stock belonging to a patient.

  Column             Type                 Null Rules
  ------------------ ------------------ ------ -----------------
  id                 uuid                   NO PK
  patient_id         uuid                   NO FK users.id
  medicine_id        uuid                   NO FK medicines.id
  quantity           numeric(12,3)          NO \>= 0
  unit               inventory_unit            NO 
  batch_number       varchar(100)          YES 
  expiry_date        date                  YES 
  purchase_date      date                  YES 
  storage_location   varchar(150)          YES 
  source             inventory_source      YES 
  archived_at        timestamptz        YES             inactive when set
  low_stock_threshold numeric(12,3)     YES             >= 0, same unit
  notes              text                  YES 
  created_at         timestamptz            NO 
  updated_at         timestamptz            NO 

### Business rules

-   Quantity cannot be negative.
-   Inventory belongs to exactly one patient.
-   Multiple records for the same medicine are allowed when batch/expiry
    differs.
-   Removal sets archived_at; current inventory queries exclude archived rows.
-   Treatment consumption must never cause quantity below zero.

------------------------------------------------------------------------

# 6. Prescriptions

## 6.1 prescriptions

  Column              Type                    Null Rules
  ------------------- --------------------- ------ ------------------------------
  id                  uuid                      NO PK
  patient_id          uuid                      NO FK users.id
  doctor_id           uuid                     YES FK users.id / doctor profile
  prescription_date   date                     YES 
  valid_until         date                     YES 
  source              prescription_source       NO 
  processing_status ocr_processing_status YES          null for manual entry
  status              prescription_status       NO 
  created_at          timestamptz               NO 
  updated_at          timestamptz               NO 

The original prescription image and structured prescription data are
separate representations.

------------------------------------------------------------------------

## 6.2 prescription_medications

Purpose: medication instructions appearing on a prescription.

  Column                Type                               Null Rules
  --------------------- -------------------------------- ------ --------------------
  id                    uuid                                 NO PK
  prescription_id       uuid                                 NO FK
  medicine_id           uuid                                YES FK after matching
  extracted_name        varchar(255)                        YES OCR/raw extraction
  dosage                numeric(12,4)                       YES 
  dosage_unit           varchar(50)                         YES 
  frequency             numeric(12,4)                       YES 
  frequency_unit        varchar(50)                         YES 
  duration              numeric(12,4)                       YES 
  duration_unit         varchar(50)                         YES 
  quantity              numeric(12,3)                       YES 
  instructions          text                                YES 
  confidence            numeric(5,4)                        YES 0..1
  confirmation_status   extraction_confirmation_status       NO 
  created_at            timestamptz                          NO 
  updated_at            timestamptz                          NO 

### Critical rule

OCR extraction is not confirmed medical data until the user confirms it.

------------------------------------------------------------------------

# 7. Treatments

## 7.1 treatments

  Column            Type                 Null Rules
  ----------------- ------------------ ------ -------------
  id                uuid                   NO PK
  patient_id        uuid                   NO FK users.id
  prescription_id   uuid                  YES FK
  name              varchar(255)           NO 
  start_date        date                   NO 
  end_date          date                  YES 
  status            treatment_status       NO 
  created_at        timestamptz            NO 
  updated_at        timestamptz            NO 

### Rules

-   `end_date >= start_date` when end_date exists.
-   An active treatment must have a valid start date.
-   Cancellation/completion is explicit.
-   A treatment may exist without a prescription.

------------------------------------------------------------------------

## 7.2 treatment_medications

Purpose: the medication regimen actually followed in a treatment.

  Column           Type              Null Rules
  ---------------- --------------- ------ -------
  id               uuid                NO PK
  treatment_id     uuid                NO FK
  medicine_id      uuid                NO FK
  dose             numeric(12,4)       NO \> 0
  dose_unit        varchar(50)         NO 
  frequency        numeric(12,4)      YES 
  frequency_unit   varchar(50)        YES 
  schedule_type    schedule_type       NO 
  duration         numeric(12,4)      YES 
  duration_unit    varchar(50)        YES 
  instructions     text               YES 
  created_at       timestamptz         NO 
  updated_at       timestamptz         NO 

A treatment medication is independent from a particular inventory batch.

------------------------------------------------------------------------

## 7.3 medication_schedules

Purpose: expected dose times.

  Column                    Type             Null Rules
  ------------------------- -------------- ------ -----------------
  id                        uuid               NO PK
  treatment_medication_id   uuid               NO FK
  time                      time               NO local user time
  timezone                  text           NO           captured IANA timezone
  days_of_week              smallint\[\]      YES 0..6
  start_date                date               NO 
  end_date                  date              YES 
  enabled                   boolean            NO default true
  created_at                timestamptz        NO 
  updated_at                timestamptz        NO 

### Rule

The profile timezone is captured into medication_schedules.timezone at creation.
Existing schedules never silently change after a profile timezone edit.
See TABLES.md section 32 for occurrence identity and the DST policy gate.

------------------------------------------------------------------------

## 7.4 medication_events

Purpose: actual dose event.

  Column                    Type                        Null Rules
  ------------------------- ------------------------- ------ -------
  id                        uuid                          NO PK
  occurrence_id             uuid           NO           FK UNIQUE
  patient_id                uuid                          NO FK
  treatment_medication_id   uuid                          NO FK
  scheduled_at              timestamptz                   NO 
  recorded_at               timestamptz                  YES 
  status                    medication_event_status       NO 
  notes                     text                         YES 
  created_at                timestamptz                   NO 

### Idempotency

A scheduled dose should not accidentally produce duplicate events.

Use a deterministic schedule occurrence identifier or an appropriate
uniqueness strategy.

------------------------------------------------------------------------

# 8. Doctor Connections — future relationship metadata

## 8.1 doctor_connections

  Column       Type                  Null Rules
  ------------ ------------------- ------ -------------
  id           uuid                    NO PK
  patient_id   uuid                    NO FK users.id
  doctor_id    uuid                    NO FK users.id
  status       connection_status       NO 
  created_at   timestamptz             NO 
  updated_at   timestamptz             NO 
  revoked_at   timestamptz            YES 

Unique active relationship:

``` text
(patient_id, doctor_id)
```

A historical connection may be retained for audit.

------------------------------------------------------------------------

# 9. Sharing

## 9.1 ShareSession and requested permissions

`share_sessions` is a bootstrap record; `share_permissions` contains requested
scope. Its patient_id, code_hash, recipient_type, counters, independent requested
grant expiry, consumed_at and cancelled_at are defined in TABLES.md sections 20–21.
No code or session ID is an ongoing access credential.

## 9.2 AccessGrant and granted permissions

`access_grants` binds patient to authenticated recipient_user_id and source session.
`access_grant_permissions` snapshots scope. Each grant has its own granted_at,
expires_at, revoked_at, revoked_by. See TABLES.md sections 21a–21b for exact keys.
Bootstrap expiration/cancellation does not revoke an issued grant.

## 9.3 Audit

`share_access_logs` references session and/or grant and the same patient. Failed
unknown-code attempts belong in sanitized security audit, not fabricated grants.
See TABLES.md section 22. Audit rows never substitute for access grants.

# 10. Community Medication Requests — FUTURE, excluded from baseline

## 10.1 medication_requests

  Column        Type                          Null Rules
  ------------- --------------------------- ------ ----------
  id            uuid                            NO PK
  patient_id    uuid                            NO FK
  medicine_id   uuid                           YES FK
  quantity      numeric(12,3)                  YES \> 0
  city          varchar(100)                   YES 
  wilaya        varchar(100)                   YES 
  latitude      numeric(9,6)                   YES optional
  longitude     numeric(9,6)                   YES optional
  description   text                           YES 
  status        medication_request_status       NO 
  expires_at    timestamptz                    YES 
  created_at    timestamptz                     NO 
  updated_at    timestamptz                     NO 

Patient precise location should not be exposed by default.

Community workflows should initially communicate availability signals
rather than enabling peer-to-peer medicine transfer.

------------------------------------------------------------------------

# 11. Notifications

## 11.1 notifications

  Column       Type                  Null Rules
  ------------ ------------------- ------ -------
  id           uuid                    NO PK
  user_id      uuid                    NO FK
  type         notification_type       NO 
  title        varchar(255)            NO 
  body         text                    NO 
  data         jsonb                  YES 
  read_at      timestamptz            YES 
  created_at   timestamptz             NO 

Do not store unnecessary sensitive information inside notification
payloads.

------------------------------------------------------------------------

# 12. Audit

## 12.1 audit_logs

  Column          Type             Null Rules
  --------------- -------------- ------ -------------
  id              uuid               NO PK
  actor_id        uuid              YES FK users.id
  action          varchar(150)       NO 
  resource_type   varchar(100)       NO 
  resource_id     uuid              YES 
  metadata        jsonb             YES sanitized
  ip_address      inet              YES 
  created_at      timestamptz        NO 

Audit records are append-oriented.

Do not allow ordinary users to edit audit history.

------------------------------------------------------------------------

# 13. Enum Definitions

ENUMS.md is the canonical vocabulary. In particular:

- inventory_unit is mandatory on each inventory record.
- prescription_status: DRAFT, CONFIRMED, ARCHIVED.
- ocr_processing_status: UPLOADED, QUEUED, PROCESSING, REVIEW_REQUIRED, COMPLETED, FAILED.
- extraction_source: OCR, AI, USER, PROFESSIONAL.
- schedule_type: FIXED_TIMES in V1; INTERVAL / AS_NEEDED deferred.
- share_recipient_type: DOCTOR, PHARMACY in V1; CAREGIVER / FAMILY deferred.
- ShareSession state derives from counters/expiry/consumed/cancelled timestamps;
  AccessGrant expiry and revocation are independent. Do not reuse a share-status enum.

Other medicine, user, treatment, event, and notification enums remain as defined
in ENUMS.md. Community enums are future-only and excluded from baseline migrations.

# 14. Foreign-Key Delete Rules

Default strategy:

## Users

Do not cascade-delete all patient health data automatically.

Account deletion must use a dedicated data-lifecycle workflow.

## Medicine master

Do not hard-delete a medicine referenced by inventory, prescriptions or
treatments.

Use:

``` text
medicine.status = ARCHIVED
```

## Inventory

Removing inventory sets archived_at and excludes the row from active views.
Keep quantity/unit, history and references; never cascade into prescriptions,
treatments, medication events, audit records, or the medicine master.

## Prescription

Do not cascade-delete related clinical history without an explicit
lifecycle policy.

## Treatment

Deleting a treatment should generally be prohibited after events exist.
Use status changes instead.

## Share

Revocation should change state rather than delete the authorization
history.

------------------------------------------------------------------------

# 15. Critical Constraints

## Inventory

``` sql
quantity >= 0
```

## Treatment

``` sql
end_date IS NULL OR end_date >= start_date
```

## Schedule

``` text
days_of_week values must be 0..6
```

## Confidence

``` text
0 <= confidence <= 1
```

## Share

``` text
max_uses > 0
use_count >= 0
use_count <= max_uses
```

## Coordinates

``` text
latitude BETWEEN -90 AND 90
longitude BETWEEN -180 AND 180
```

## Dosage

Dose quantities must be positive where present.

------------------------------------------------------------------------

# 16. Index Strategy

Minimum indexes:

``` text
users(email)
users(phone)

medicines(normalized_name)
medicines(generic_name)
medicines(manufacturer_id)
medicines(status)

active_ingredients(normalized_name)

medicine_barcodes(barcode)

medication_inventory(patient_id)
medication_inventory(patient_id, expiry_date)
medication_inventory(medicine_id)
medication_inventory(patient_id, medicine_id)

prescriptions(patient_id)
prescriptions(doctor_id)
prescriptions(prescription_date)

prescription_medications(prescription_id)
prescription_medications(medicine_id)

treatments(patient_id, status)
treatment_medications(treatment_id)
treatment_medications(medicine_id)

medication_schedules(treatment_medication_id, enabled)

medication_events(patient_id, scheduled_at)
medication_events(treatment_medication_id, scheduled_at)

doctor_connections(patient_id, status)
doctor_connections(doctor_id, status)

share_sessions(code_hash)
share_sessions(patient_id, expires_at)
share_sessions(expires_at)

share_permissions(share_session_id)

share_access_logs(patient_id, created_at)
share_access_logs(accessor_id, created_at)

medication_requests(medicine_id, status)
medication_requests(wilaya, city, status)

notifications(user_id, read_at, created_at)

audit_logs(actor_id, created_at)
audit_logs(resource_type, resource_id)
```

------------------------------------------------------------------------

# 17. Search Strategy

Medicine search is multilingual and should support:

-   English
-   French
-   Arabic
-   transliterated Arabic where practical
-   brand names
-   generic names
-   ingredient names
-   common spelling variations

Do not solve this exclusively with a simple `LIKE '%query%'`.

Start with PostgreSQL capabilities and normalized search fields.

Potential later upgrade:

``` text
PostgreSQL
+
pg_trgm
+
full-text search
```

A dedicated search engine should only be introduced when scale or
relevance requirements justify it.

------------------------------------------------------------------------

# 18. Data Provenance

Medicine master records should retain enough provenance to answer:

> Where did this medicine information come from?

At minimum:

``` text
source
source_version
source_updated_at
created_at
updated_at
```

For imports, add a future import model:

``` text
medicine_import_jobs
medicine_import_records
```

This should be implemented before automated large-scale catalog imports.

------------------------------------------------------------------------

# 19. Future Tables

Do not implement these in MVP unless required:

``` text
dependents
caregiver_connections

pharmacies
pharmacy_locations
pharmacy_inventory
pharmacy_inventory_batches

medication_request_responses


medicine_import_jobs
medicine_import_records
medicine_change_history

ai_conversations
ai_messages
ai_tool_calls

file_assets
```

These are intentionally separated from the initial core model so the MVP
remains manageable.

------------------------------------------------------------------------

# 20. AI Data Access Boundary

The database schema must never be treated as the AI interface.

Correct:

``` text
AI
 ↓
Tool
 ↓
Authorization
 ↓
Domain service
 ↓
Repository
 ↓
PostgreSQL
```

Incorrect:

``` text
AI
 ↓
SQL
 ↓
PostgreSQL
```

Every AI tool must derive patient identity from authenticated server
context.

------------------------------------------------------------------------

# 21. Inventory Consumption Model

The first MVP should keep inventory consumption simple.

A treatment dose can calculate expected consumption from:

``` text
dose × number of scheduled doses
```

The system should not automatically assume which physical batch was
consumed unless a deterministic inventory allocation strategy is
explicitly implemented.

For MVP:

``` text
Treatment requirement
        ↓
Inventory availability calculation
        ↓
User-visible estimate
```

Later:

``` text
Dose event
 ↓
Inventory allocation
 ↓
Specific batch decrement
 ↓
Inventory transaction history
```

A future `inventory_transactions` table is recommended before
implementing detailed automatic stock accounting.

------------------------------------------------------------------------

# 22. Recommended Future Inventory Transactions

When detailed stock accounting is introduced:

``` text
inventory_transactions
```

Suggested fields:

``` text
id
inventory_id
patient_id
transaction_type
quantity_delta
reason
treatment_medication_id nullable
medication_event_id nullable
created_at
```

Examples:

``` text
ADD
MANUAL_ADJUSTMENT
DOSE_CONSUMPTION
EXPIRED
REMOVED
CORRECTION
```

This creates an auditable stock ledger instead of relying only on a
mutable quantity field.

------------------------------------------------------------------------

# 23. Transaction Boundaries

Use database transactions for operations such as:

## Prescription confirmation

``` text
confirm extraction
 ↓
update prescription medications
 ↓
audit
```

## Treatment creation

``` text
create treatment
 ↓
create treatment medications
 ↓
create schedules
```

## Share creation

``` text
create share session
 ↓
create permissions
 ↓
audit
```

## Share redemption

``` text
verify bootstrap session and recipient
 ↓
increment use_count atomically
 ↓
create AccessGrant and permission snapshot; consume when exhausted
 ↓
audit
```

## Dose recording

If inventory consumption is enabled:

``` text
record medication event
 ↓
allocate/decrement inventory
 ↓
audit
```

All dependent writes must succeed or roll back together.

------------------------------------------------------------------------

# 24. Patient Ownership Model

Every patient-owned health resource must have an unambiguous ownership
path.

Examples:

``` text
medication_inventory.patient_id
prescriptions.patient_id
treatments.patient_id
medication_events.patient_id
medication_requests.patient_id
```

Do not infer ownership through a long chain when a direct ownership
field improves authorization clarity and query safety.

------------------------------------------------------------------------

# 25. Professional Access Model

Only a recipient-bound AccessGrant with valid expiry, no revocation and the
required permission authorizes professional shared reads. Also validate the
actor's account/session, role and every resource's patient ownership.

A doctor connection is future relationship metadata and never confers implicit
access. Neither share_sessions nor share_access_logs authorize ongoing reads.
See SHARING.md for field-level permission semantics and API-CONTRACT.md for routes.

# 26. ERD Implementation Acceptance Criteria

The database implementation is accepted only when:

### Identity

-   users and profiles are separated
-   roles are explicit
-   professional verification is explicit

### Medicine

-   medicine master is independent from patient inventory
-   ingredients are normalized
-   barcodes are unique
-   provenance exists

### Inventory

-   patient ownership is explicit
-   batch/expiry can coexist
-   quantity cannot be negative

### Prescription

-   OCR data can remain pending
-   confirmation status exists
-   prescription medicine can be unresolved until matching

### Treatment

-   treatment can originate without a prescription
-   treatment medications reference master medicines
-   schedules are separate
-   dose events are separate

### Sharing

-   short-lived code is hashed
-   permissions are normalized
-   access is auditable
-   revocation is state-based

### Security

-   every patient-owned table has a clear authorization path
-   no direct database access from mobile
-   AI cannot directly query SQL

------------------------------------------------------------------------

# 27. Database Deliverables and Document Location

Root-level ERD.md, TABLES.md, ENUMS.md, INDEXES.md, CONSTRAINTS.md, MIGRATIONS.md,
and API-CONTRACT.md remain authoritative. Do not relocate them. Approved
foundation decisions are recorded in docs/decisions/foundation-proposal.md.
The migration order is a future plan only; no migration is created by this task.

# 28. Non-Negotiable Domain Rule

The following distinction must remain true throughout the entire
project:

``` text
MEDICINE
"What is this pharmaceutical product?"

MEDICATION INVENTORY
"What physical stock does this patient have?"

PRESCRIPTION MEDICATION
"What did the prescription specify?"

TREATMENT MEDICATION
"What medication regimen is the patient following?"

MEDICATION SCHEDULE
"When should the patient take it?"

MEDICATION EVENT
"What actually happened with that scheduled dose?"
```

If a future implementation attempts to merge these concepts into one
table or one generic "medication" entity, stop and review the
architecture before proceeding.

# 29. Foundation relationships added on 2026-09-14

TABLES.md section 32 defines sessions, ordered prescription_documents,
append-only prescription_extracted_fields, medication_occurrences, and mandatory
notification_preferences, with types, keys, and ownership invariants.

Inventory requires an explicit inventory_unit and may be archived. Prescribed
quantity is null when unknown and strictly positive when supplied. A prescription
has separate business status and nullable OCR processing state. Single image URL
storage is superseded by the document relationship. Fixed-time occurrence IDs
are stable across retries; event.occurrence_id is unique. Notification preferences
are part of MVP; provider-specific push registration is decided before delivery.

The scalar quantity × dose-count example in section 21 is valid only when the
regimen and inventory units are explicitly compatible. Do not infer conversion
from free-text strength, use AI for conversion, or automatically allocate batches.
