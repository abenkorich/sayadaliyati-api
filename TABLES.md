# Saydaliyati --- TABLES.md

Version: 1.0\
Status: Implementation baseline\
Database: PostgreSQL

This document converts the conceptual ERD into an
implementation-oriented table specification.

------------------------------------------------------------------------

# 1. Conventions

## IDs

All primary keys use:

``` sql
uuid
```

Generate IDs at the application/database boundary using a
cryptographically appropriate UUID strategy.

## Timestamps

Use:

``` sql
timestamptz
```

Store timestamps in UTC.

## Text

Use `text` when there is no meaningful database length constraint. Use
`varchar(n)` only where a practical maximum is useful.

## Money

Do not use floating-point numbers for monetary values. Monetary fields
are intentionally absent from the MVP core model.

## Soft deletion

Do not add generic `deleted_at` to every table.

Use explicit lifecycle/status fields where domain history matters.

------------------------------------------------------------------------

# 2. users

Authentication identity.

  Column              PostgreSQL       Null Default     Key/Constraint
  ------------------- -------------- ------ ----------- ---------------------
  id                  uuid               NO generated   PK
  email               varchar(320)      YES             unique when present
  phone               varchar(32)       YES             unique when present
  password_hash       text              YES             
  role                user_role          NO `PATIENT`   
  status              user_status        NO `ACTIVE`    
  created_at          timestamptz        NO now()       
  updated_at          timestamptz        NO now()       
  last_login_at       timestamptz       YES             
  email_verified_at   timestamptz       YES             
  phone_verified_at   timestamptz       YES             

### Constraints

At least one of email/phone must be present for password-based
authentication.

Normalize email before comparison.

Phone should use normalized international representation.

------------------------------------------------------------------------

# 3. patient_profiles

Patient-specific information.

  Column               PostgreSQL        Null Default   Key/Constraint
  -------------------- --------------- ------ --------- ----------------
  user_id              uuid                NO           PK/FK users.id
  first_name           varchar(100)        NO           
  last_name            varchar(100)        NO           
  date_of_birth        date               YES           
  preferred_language   language_code       NO `EN`      
  timezone             varchar(64)         NO `UTC`     
  created_at           timestamptz         NO now()     
  updated_at           timestamptz         NO now()     

------------------------------------------------------------------------

# 4. doctor_profiles

Verified professional identity.

  Column                PostgreSQL              Null Default     Key/Constraint
  --------------------- --------------------- ------ ----------- ---------------------
  user_id               uuid                      NO             PK/FK users.id
  professional_number   varchar(100)             YES             unique when present
  first_name            varchar(100)              NO             
  last_name             varchar(100)              NO             
  specialty             varchar(150)             YES             
  organization_name     varchar(200)             YES             
  verification_status   verification_status       NO `PENDING`   
  verified_at           timestamptz              YES             
  created_at            timestamptz               NO now()       
  updated_at            timestamptz               NO now()       

------------------------------------------------------------------------

# 5. pharmacy_profiles

Pharmacy identity and location.

  Column                PostgreSQL              Null Default     Key/Constraint
  --------------------- --------------------- ------ ----------- ---------------------
  user_id               uuid                      NO             PK/FK users.id
  pharmacy_name         varchar(200)              NO             
  registration_number   varchar(100)             YES             unique when present
  address               text                     YES             
  city                  varchar(100)             YES             
  wilaya                varchar(100)             YES             
  latitude              numeric(9,6)             YES             -90..90
  longitude             numeric(9,6)             YES             -180..180
  phone                 varchar(32)              YES             
  verification_status   verification_status       NO `PENDING`   
  verified_at           timestamptz              YES             
  created_at            timestamptz               NO now()       
  updated_at            timestamptz               NO now()       

------------------------------------------------------------------------

# 6. manufacturers

Medicine manufacturer master.

  Column            PostgreSQL       Null Default     Key/Constraint
  ----------------- -------------- ------ ----------- ----------------
  id                uuid               NO generated   PK
  name              varchar(255)       NO             
  normalized_name   varchar(255)       NO             indexed
  country           varchar(100)      YES             
  website           varchar(500)      YES             
  created_at        timestamptz        NO now()       
  updated_at        timestamptz        NO now()       

------------------------------------------------------------------------

# 7. medicines

Canonical pharmaceutical product.

  Column                PostgreSQL          Null Default     Key/Constraint
  --------------------- ----------------- ------ ----------- ---------------------
  id                    uuid                  NO generated   PK
  name                  varchar(255)          NO             
  normalized_name       varchar(255)          NO             indexed
  brand_name            varchar(255)         YES             
  generic_name          varchar(255)         YES             indexed
  strength              varchar(100)         YES             
  dosage_form           varchar(100)         YES             
  route                 varchar(100)         YES             
  package_size          varchar(100)         YES             
  manufacturer_id       uuid                 YES             FK manufacturers.id
  registration_number   varchar(150)         YES             
  status                medicine_status       NO `ACTIVE`    
  country               varchar(100)         YES             
  description           text                 YES             
  source                varchar(150)         YES             provenance
  source_version        varchar(100)         YES             provenance
  source_updated_at     timestamptz          YES             provenance
  created_at            timestamptz           NO now()       
  updated_at            timestamptz           NO now()       

Do not hard-delete referenced medicine records.

------------------------------------------------------------------------

# 8. active_ingredients

Normalized active ingredient master.

  Column            PostgreSQL       Null Default     Key/Constraint
  ----------------- -------------- ------ ----------- ----------------
  id                uuid               NO generated   PK
  name              varchar(255)       NO             
  normalized_name   varchar(255)       NO             unique/indexed
  description       text              YES             
  created_at        timestamptz        NO now()       
  updated_at        timestamptz        NO now()       

------------------------------------------------------------------------

# 9. medicine_ingredients

Medicine/ingredient many-to-many relationship.

  Column          PostgreSQL        Null Default   Key/Constraint
  --------------- --------------- ------ --------- ----------------
  medicine_id     uuid                NO           PK/FK
  ingredient_id   uuid                NO           PK/FK
  amount          numeric(12,4)      YES           
  unit            varchar(50)        YES           
  created_at      timestamptz         NO now()     

Primary key:

``` text
(medicine_id, ingredient_id)
```

------------------------------------------------------------------------

# 10. medicine_barcodes

Barcode lookup records.

  Column         PostgreSQL       Null Default     Key/Constraint
  -------------- -------------- ------ ----------- ----------------
  id             uuid               NO generated   PK
  medicine_id    uuid               NO             FK
  barcode        varchar(100)       NO             unique
  barcode_type   barcode_type       NO             
  country        varchar(10)       YES             
  created_at     timestamptz        NO now()       

Normalize barcode before lookup.

------------------------------------------------------------------------

# 11. medicine_images

Package images stored externally.

  Column        PostgreSQL              Null Default     Key/Constraint
  ------------- --------------------- ------ ----------- ----------------
  id            uuid                      NO generated   PK
  medicine_id   uuid                      NO             FK
  url           text                      NO             
  image_type    medicine_image_type       NO             
  sort_order    integer                   NO 0           \>= 0
  source        varchar(150)             YES             
  created_at    timestamptz               NO now()       

Do not store large image binaries in PostgreSQL.

------------------------------------------------------------------------

# 12. medication_inventory

Physical stock owned by a patient.

  Column             PostgreSQL           Null Default     Key/Constraint
  ------------------ ------------------ ------ ----------- -----------------
  id                 uuid                   NO generated   PK
  patient_id         uuid                   NO             FK users.id
  medicine_id        uuid                   NO             FK medicines.id
  quantity           numeric(12,3)          NO             \>= 0
  unit               inventory_unit            NO             
  batch_number       varchar(100)          YES             
  expiry_date        date                  YES             
  purchase_date      date                  YES             
  storage_location   varchar(150)          YES             
  source             inventory_source      YES             
  archived_at        timestamptz        YES             inactive when set
  low_stock_threshold numeric(12,3)     YES             >= 0, same unit
  notes              text                  YES             
  created_at         timestamptz            NO now()       
  updated_at         timestamptz            NO now()       

Multiple inventory rows may represent different batches.

Removal sets `archived_at`; ordinary reads exclude archived records.

------------------------------------------------------------------------

# 13. prescriptions

Prescription document and structured parent record.

  Column              PostgreSQL              Null Default     Key/Constraint
  ------------------- --------------------- ------ ----------- ----------------
  id                  uuid                      NO generated   PK
  patient_id          uuid                      NO             FK users.id
  doctor_id           uuid                     YES             FK users.id
  prescription_date   date                     YES             
  valid_until         date                     YES             
  source              prescription_source       NO             
  processing_status ocr_processing_status YES          null for manual entry
  status              prescription_status       NO `DRAFT`     
  created_at          timestamptz               NO now()       
  updated_at          timestamptz               NO now()       

`doctor_id` must refer to an authenticated doctor identity whose profile
can be verified separately.

------------------------------------------------------------------------

# 14. prescription_medications

Structured medication instruction extracted from a prescription.

  -------------------------------------------------------------------------------------------------------
  Column                PostgreSQL                                    Null Default       Key/Constraint
  --------------------- -------------------------------- ----------------- ------------- ----------------
  id                    uuid                                            NO generated     PK

  prescription_id       uuid                                            NO               FK

  medicine_id           uuid                                           YES               FK

  extracted_name        varchar(255)                                   YES               

  dosage                numeric(12,4)                                  YES               \> 0

  dosage_unit           varchar(50)                                    YES               

  frequency             numeric(12,4)                                  YES               \> 0

  frequency_unit        varchar(50)                                    YES               

  duration              numeric(12,4)                                  YES               \> 0

  duration_unit         varchar(50)                                    YES               

  quantity              numeric(12,3)                                  YES               \> 0

  instructions          text                                           YES               

  confidence            numeric(5,4)                                   YES               0..1

  confirmation_status   extraction_confirmation_status                  NO `PENDING`     

  created_at            timestamptz                                     NO now()         

  updated_at            timestamptz                                     NO now()         
  -------------------------------------------------------------------------------------------------------

An unresolved medicine may temporarily have `medicine_id = NULL`.

------------------------------------------------------------------------

# 15. treatments

Patient treatment/course.

  Column            PostgreSQL           Null Default     Key/Constraint
  ----------------- ------------------ ------ ----------- ----------------
  id                uuid                   NO generated   PK
  patient_id        uuid                   NO             FK users.id
  prescription_id   uuid                  YES             FK
  name              varchar(255)           NO             
  start_date        date                   NO             
  end_date          date                  YES             \>= start_date
  status            treatment_status       NO `PLANNED`   
  created_at        timestamptz            NO now()       
  updated_at        timestamptz            NO now()       

A treatment can exist without a prescription.

------------------------------------------------------------------------

# 16. treatment_medications

The actual regimen inside a treatment.

  Column           PostgreSQL        Null Default     Key/Constraint
  ---------------- --------------- ------ ----------- ----------------
  id               uuid                NO generated   PK
  treatment_id     uuid                NO             FK
  medicine_id      uuid                NO             FK
  dose             numeric(12,4)       NO             \> 0
  dose_unit        varchar(50)         NO             
  frequency        numeric(12,4)      YES             \> 0
  frequency_unit   varchar(50)        YES             
  schedule_type    schedule_type       NO             
  duration         numeric(12,4)      YES             \> 0
  duration_unit    varchar(50)        YES             
  instructions     text               YES             
  created_at       timestamptz         NO now()       
  updated_at       timestamptz         NO now()       

Do not link a treatment medication directly to a single inventory batch.

------------------------------------------------------------------------

# 17. medication_schedules

Expected dose schedule.

  Column                    PostgreSQL       Null Default     Key/Constraint
  ------------------------- -------------- ------ ----------- ----------------
  id                        uuid               NO generated   PK
  treatment_medication_id   uuid               NO             FK
  time                      time               NO             
  timezone                  text           NO           captured IANA timezone
  days_of_week              smallint\[\]      YES             values 0..6
  start_date                date               NO             
  end_date                  date              YES             \>= start_date
  enabled                   boolean            NO true        
  created_at                timestamptz        NO now()       
  updated_at                timestamptz        NO now()       

Times use the schedule timezone captured from the patient profile; see section 32.

------------------------------------------------------------------------

# 18. medication_events

Actual dose occurrence.

  Column                    PostgreSQL                  Null Default     Key/Constraint
  ------------------------- ------------------------- ------ ----------- ----------------
  id                        uuid                          NO generated   PK
  occurrence_id             uuid           NO           FK UNIQUE
  patient_id                uuid                          NO             FK
  treatment_medication_id   uuid                          NO             FK
  scheduled_at              timestamptz                   NO             
  recorded_at               timestamptz                  YES             
  status                    medication_event_status       NO             
  notes                     text                         YES             
  created_at                timestamptz                   NO now()       

Required occurrence_id UUID FK UNIQUE and stable occurrence generation are defined in section 32.

------------------------------------------------------------------------

# 19. doctor_connections — future relationship metadata, not access authority

Persistent patient-doctor relationship.

  Column       PostgreSQL            Null Default     Key/Constraint
  ------------ ------------------- ------ ----------- ----------------
  id           uuid                    NO generated   PK
  patient_id   uuid                    NO             FK users.id
  doctor_id    uuid                    NO             FK users.id
  status       connection_status       NO `PENDING`   
  created_at   timestamptz             NO now()       
  updated_at   timestamptz             NO now()       
  revoked_at   timestamptz            YES             

Prevent duplicate active patient-doctor connections.

------------------------------------------------------------------------

# 20. share_sessions

Short-lived authorization bootstrap. No ongoing health-data access is authorized
by a ShareSession. Columns:

- `id uuid` PK; `patient_id uuid NOT NULL` FK users.id.
- `recipient_type share_recipient_type NOT NULL`: DOCTOR or PHARMACY only.
- `code_hash text NOT NULL`; never plaintext. The cryptographic lookup strategy
  must support safe lookup and avoid ambiguous simultaneously redeemable codes.
- `created_at timestamptz NOT NULL`, `expires_at timestamptz NOT NULL`.
- `consumed_at timestamptz NULL`, `cancelled_at timestamptz NULL`.
- `max_attempts integer NOT NULL > 0`, `failed_attempts integer NOT NULL >= 0`.
- `max_uses integer NOT NULL > 0`, `use_count integer NOT NULL DEFAULT 0`.
- `grant_expires_at timestamptz NULL`: independent grant expiry explicitly approved
  by the patient at creation. Null means no scheduled grant expiry, not no revocation.
- Requested permissions are in share_permissions.

Use count is capped by max_uses. Set consumed_at when the permitted uses are
exhausted (the single-use flow consumes on first redemption). Cancellation,
expiry, exhaustion, or the attempt limit prevents redemption. Increment use count,
create AccessGrant and permissions, consume if exhausted, and append audit in one
transaction. Per-actor/IP rate limiting is also mandatory; unmatched guesses have
no session to charge, so session counters alone are insufficient.

AccessGrant expiry is separate; code expiry/cancellation never revokes issued grants.
Exact TTLs, attempt caps, hash construction, and any multi-use UI remain open.

# 21. share_permissions

Requested bootstrap scope:

- id UUID PK; share_session_id UUID NOT NULL FK; permission share_permission NOT NULL;
  created_at timestamptz NOT NULL.
- Unique (share_session_id, permission); at least one permission per session.
- Snapshot into grant permissions at redemption, never expand permissions silently.

## 21a. access_grants

- `id uuid` PK; `patient_id uuid NOT NULL` FK users.id.
- `recipient_user_id uuid NOT NULL` FK users.id; derived from authenticated redemption.
- `recipient_type share_recipient_type NOT NULL`; must match the recipient's role.
- `source_share_session_id uuid NOT NULL` FK share_sessions.id.
- `granted_at timestamptz NOT NULL`, `expires_at timestamptz NULL`.
- `revoked_at timestamptz NULL`, `revoked_by uuid NULL` FK users.id.
- `UNIQUE(source_share_session_id, recipient_user_id)` prevents repeated redemption
  by the same recipient creating duplicate grants or consuming additional uses.
- Source patient and recipient type must agree with the session. Use a composite
  FK or transactional invariant for that relationship. Grant permission rows
  must be a snapshot of the patient's approved source permissions.
- expires_at, if set, must be later than granted_at; revoked_at and revoked_by
  are populated together for owner-initiated revocation. No broad admin bypass
  is created by this contract.

Ongoing access requires matching recipient identity, active account/session,
non-revoked/non-expired grant, required permission, and correct patient scope.

## 21b. access_grant_permissions

- id UUID PK; access_grant_id UUID NOT NULL FK; permission share_permission NOT NULL;
  created_at timestamptz NOT NULL.
- Unique (access_grant_id, permission); at least one permission per grant.
- Field projections follow SHARING.md; permissions do not imply one another.

# 22. share_access_logs

- id UUID PK; share_session_id UUID nullable FK; access_grant_id UUID nullable FK.
- patient_id UUID NOT NULL FK users.id; accessor_id UUID nullable FK users.id.
- action varchar(100) NOT NULL; resource_type varchar(100) nullable.
- ip_address inet nullable; user_agent text nullable; created_at timestamptz NOT NULL.
- At least one session/grant reference; references must belong to the same patient.
- Known-session failed attempts can have no accessor. Unmatched guesses are
  sanitized security audit events without fabricated patient/session IDs.
- Logs are append-only and never used as the source of authorization.

# 23. medication_requests — FUTURE, excluded from baseline migrations

Community availability request.

  Column        PostgreSQL                    Null Default     Key/Constraint
  ------------- --------------------------- ------ ----------- ----------------
  id            uuid                            NO generated   PK
  patient_id    uuid                            NO             FK
  medicine_id   uuid                           YES             FK
  quantity      numeric(12,3)                  YES             \> 0
  city          varchar(100)                   YES             
  wilaya        varchar(100)                   YES             
  latitude      numeric(9,6)                   YES             
  longitude     numeric(9,6)                   YES             
  description   text                           YES             
  status        medication_request_status       NO `OPEN`      
  expires_at    timestamptz                    YES             
  created_at    timestamptz                     NO now()       
  updated_at    timestamptz                     NO now()       

------------------------------------------------------------------------

# 24. notifications

Application notification record.

  Column       PostgreSQL            Null Default     Key/Constraint
  ------------ ------------------- ------ ----------- ----------------
  id           uuid                    NO generated   PK
  user_id      uuid                    NO             FK
  type         notification_type       NO             
  title        varchar(255)            NO             
  body         text                    NO             
  data         jsonb                  YES             sanitized
  read_at      timestamptz            YES             
  created_at   timestamptz             NO now()       

------------------------------------------------------------------------

# 25. audit_logs

Security and operational audit trail.

  Column          PostgreSQL       Null Default     Key/Constraint
  --------------- -------------- ------ ----------- ----------------
  id              uuid               NO generated   PK
  actor_id        uuid              YES             FK users.id
  action          varchar(150)       NO             
  resource_type   varchar(100)       NO             
  resource_id     uuid              YES             
  metadata        jsonb             YES             sanitized
  ip_address      inet              YES             
  created_at      timestamptz        NO now()       

Audit logs are append-only from the application's perspective.

------------------------------------------------------------------------

# 26. Foreign Keys

Recommended relationships:

``` text
patient_profiles.user_id → users.id
doctor_profiles.user_id → users.id
pharmacy_profiles.user_id → users.id

medicines.manufacturer_id → manufacturers.id
medicine_ingredients.medicine_id → medicines.id
medicine_ingredients.ingredient_id → active_ingredients.id
medicine_barcodes.medicine_id → medicines.id
medicine_images.medicine_id → medicines.id

medication_inventory.patient_id → users.id
medication_inventory.medicine_id → medicines.id

prescriptions.patient_id → users.id
prescriptions.doctor_id → users.id
prescription_medications.prescription_id → prescriptions.id
prescription_medications.medicine_id → medicines.id

treatments.patient_id → users.id
treatments.prescription_id → prescriptions.id
treatment_medications.treatment_id → treatments.id
treatment_medications.medicine_id → medicines.id
medication_schedules.treatment_medication_id → treatment_medications.id
medication_events.patient_id → users.id
medication_events.treatment_medication_id → treatment_medications.id

doctor_connections.patient_id → users.id
doctor_connections.doctor_id → users.id

sessions.user_id → users.id
share_sessions.patient_id → users.id
access_grants.patient_id → users.id
access_grants.recipient_user_id → users.id
access_grants.source_share_session_id → share_sessions.id
access_grants.revoked_by → users.id
access_grant_permissions.access_grant_id → access_grants.id
share_permissions.share_session_id → share_sessions.id
share_access_logs.share_session_id → share_sessions.id
share_access_logs.patient_id → users.id
share_access_logs.access_grant_id → access_grants.id
share_access_logs.accessor_id → users.id

medication_requests.patient_id → users.id
medication_requests.medicine_id → medicines.id

prescription_documents.prescription_id → prescriptions.id
prescription_documents.patient_id → users.id
prescription_extracted_fields.prescription_medication_id → prescription_medications.id
prescription_extracted_fields.confirmed_by → users.id
medication_occurrences.schedule_id → medication_schedules.id
medication_occurrences.patient_id → users.id
medication_events.occurrence_id → medication_occurrences.id
notification_preferences.user_id → users.id
notifications.user_id → users.id
audit_logs.actor_id → users.id
```

------------------------------------------------------------------------

# 27. Delete Strategy

Default:

``` text
ON DELETE RESTRICT
```

for important health-data relationships.

Use `CASCADE` only for dependent records where losing the child is
unquestionably correct.

Examples suitable for cascade:

``` text
medicine → medicine_images
medicine → medicine_barcodes
medicine → medicine_ingredients
```

Avoid cascading from:

``` text
users → prescriptions
users → treatments
users → medication_events
```

Account deletion requires a controlled data-lifecycle process.

------------------------------------------------------------------------

# 28. Derived Data

Do not persist values that can safely be calculated unless performance
requires it.

Examples:

Do not store:

``` text
patient.age
treatment.days_remaining
inventory.is_expiring
```

Calculate them from source data.

Persist only when caching/materialization is justified and the
invalidation strategy is defined.

------------------------------------------------------------------------

# 29. Recommended Additional Tables Before Scale

These are future or separately gated additions unless explicitly identified below
as required MVP persistence.

## inventory_transactions

Creates an auditable stock ledger.

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

## notification_devices

Separate provider-neutral registration for the notification slice; see section 32.
Provider and final registration contract remain open.

## notification_preferences

Required for MVP; defined in section 32. Not deferred.

## medicine_import_jobs

Tracks catalog imports.

## medicine_import_records

Tracks individual source records and outcomes.

## file_assets

Centralized secure file metadata.

## ai_conversations

Only if persistent AI conversation history is required.

## ai_tool_calls

Useful for AI observability and debugging.

------------------------------------------------------------------------

# 30. Initial Migration Order

MIGRATIONS.md section 2 is the canonical dependency sequence for future Prisma
migrations. It includes sessions, prescription documents/field revisions,
occurrences, AccessGrants, grant permissions and notification preferences.
Community and separate doctor-connection workflows are excluded from the initial
chain. No schema or migration is generated during contract reconciliation.

# 31. Database Acceptance Checklist

Before moving to API implementation:

-   [ ] All PKs defined
-   [ ] All FKs defined
-   [ ] Delete rules reviewed
-   [ ] All important indexes defined
-   [ ] Check constraints defined
-   [ ] Enum values defined
-   [ ] Ownership paths verified
-   [ ] Share-code storage is hashed
-   [ ] OCR confidence and confirmation exist
-   [ ] Medicine/inventory/treatment separation preserved
-   [ ] Migration order defined
-   [ ] Clean database can be created from migrations
-   [ ] Seed strategy defined separately from migrations

# 32. Approved foundation persistence details

## Sessions

`sessions` is required by authentication:

- `id uuid` primary key; `user_id uuid NOT NULL` references users.
- `refresh_token_hash text NOT NULL`: verification material only, never plaintext.
- `device_metadata jsonb NULL`: minimal, sanitized device context, not credentials.
- `created_at timestamptz NOT NULL`, `last_used_at timestamptz NULL`.
- `expires_at timestamptz NOT NULL`, `revoked_at timestamptz NULL`.
- Expiry must follow creation; revoked sessions cannot refresh or authorize access.
- Refresh verification and replacement of the current hash occur atomically.
  Concurrent use of the same token cannot mint two replacements. D014 defines token
  encoding, SHA-256 verification hashes, 30-day absolute expiry and authenticated
  replay revocation. No plaintext token is persisted.

## Prescription documents

`prescription_documents` replaces the single image URL:

- `id uuid` primary key; `prescription_id uuid NOT NULL`; `patient_id uuid NOT NULL`.
- FK `(prescription_id, patient_id)` references prescriptions `(id, patient_id)`.
- `page_number integer NOT NULL > 0`; unique `(prescription_id, page_number)`.
- `storage_key text NOT NULL UNIQUE`; generated by the server for private storage.
- `mime_type text NOT NULL`; verified against file content and the upload allowlist.
- `processing_status ocr_processing_status NOT NULL`; independent of business status.
- `created_at timestamptz NOT NULL`, `retention_until timestamptz NULL`,
  `deleted_at timestamptz NULL`. Retention durations and legal exceptions remain open.
- A manual prescription may have zero or more ordered image attachments (D018);
  a scanned prescription has one or more ordered pages. Storage keys and signed URLs are never permanent public links.
- Retrieval authorizes the owner or a valid READ_PRESCRIPTIONS grant for a
  CONFIRMED prescription before issuing a short-lived signed URL. Never return
  credentials or storage keys in ordinary API data. Audit sensitive downloads.
- Revocation stops new URL issuance. Already-issued URLs may live until their
  short expiry. D018 limits owner links to 60 seconds; stronger revocation and
  shared-recipient issuance remain unimplemented. No retroactive recall is promised.

## Field-level extraction revisions

`prescription_extracted_fields` is a normalized, append-only revision record:

- `id uuid` primary key; `prescription_medication_id uuid NOT NULL` FK.
- `field_name text NOT NULL`; API allowlist only.
- `revision integer NOT NULL > 0`; unique `(prescription_medication_id, field_name, revision)`.
- `value jsonb NULL`: a typed scalar/structured value validated for that field.
- `confidence numeric(5,4) NULL`: if present, between 0 and 1; do not invent
  confidence for user-entered data.
- `source extraction_source NOT NULL`: OCR, AI, USER, or PROFESSIONAL; assigned
  by server context, never trusted from client input.
- `confirmed boolean NOT NULL`; unreviewed extraction begins false.
- `confirmed_by uuid NULL` FK users; `confirmed_at timestamptz NULL`.
- `created_at timestamptz NOT NULL`.
- A confirmed revision requires confirmation actor and timestamp; an unconfirmed
  revision has neither. Edits and confirmations append revisions atomically;
  previous extracted values and provenance are retained under the health-data
  retention policy. A pure confirmation preserves the value's original source;
  an edited user value has source USER. No professional editing API is added here.
- Allowlisted fields cover medicineId, extractedName, strength, dosage, dosageUnit,
  frequency, frequencyUnit, duration, durationUnit, quantity, instructions,
  scheduledTimes, startDate, endDate. Validate field types and positive-or-null
  prescription quantity. Unknown values remain null and are not fabricated.
- The latest revision per field is the review projection. Existing medication
  columns and medication-level confidence/confirmation are synchronized summaries;
  they cannot bypass field-level review. Retained lines must have their required
  fields explicitly confirmed before the prescription becomes CONFIRMED.
  Rejected lines stay in review history and do not become treatment inputs.

## Fixed-time schedule occurrences

V1 accepts FIXED_TIMES only. A schedule row represents one local daily time and
its applicable weekdays/date range. Sunday is 0 and Saturday is 6.

- Add `timezone text NOT NULL` to medication_schedules: validated IANA timezone,
  captured from patient_profiles at creation. A later profile timezone change
  never silently shifts an existing schedule.
- Once occurrences exist, timing/date/timezone edits must not rewrite that
  schedule's historical identity. Disable/end-date the old schedule and create a
  future-effective replacement; do not leave overlapping active replacements.
- `medication_occurrences`: `id uuid` PK, `patient_id uuid NOT NULL`,
  `schedule_id uuid NOT NULL` FK medication_schedules, `local_date date NOT NULL`,
  `timezone text NOT NULL`, `scheduled_at timestamptz NOT NULL`,
  `created_at timestamptz NOT NULL`.
- Unique `(schedule_id, local_date)` identifies a single fixed-time occurrence.
  Create/retrieve it transactionally and expose its stable UUID as occurrenceId.
  Changing formatting or retrying must return the same occurrence identity.
- Add `occurrence_id uuid NOT NULL UNIQUE` to medication_events. The server checks
  occurrence patient and schedule→treatment medication→treatment ownership.
  Denormalized patient_id, treatment_medication_id, and scheduled_at on events
  must agree with the occurrence and are server-derived, never client authority.
- An identical retry returns the existing event. A conflicting status/notes for
  the same occurrence returns MEDICATION_EVENT_CONFLICT, without overwriting history.
- Only active, valid schedules generate eligible occurrences. DST gaps/folds,
  travel/timezone changes, retrospective edits, and the missed-dose cutoff need
  explicit policy before the treatment slice; do not silently choose an offset
  or generate an occurrence that cannot be resolved safely. This does not block
  the tooling bootstrap or manual inventory slice.

## Notification preferences

`notification_preferences` is MVP persistence, not a scale-only addition:

- `user_id uuid` PK/FK users.
- `dose_reminders boolean NOT NULL`, `expiry_reminders boolean NOT NULL`,
  `low_stock_alerts boolean NOT NULL`, `sharing_notifications boolean NOT NULL`,
  `system_notifications boolean NOT NULL`.
- `expiry_lead_days integer NULL >= 0`.
- `created_at timestamptz NOT NULL`, `updated_at timestamptz NOT NULL`.
- Initial settings/default policy is open. Missing preferences must not be
  interpreted as consent; no preference-controlled delivery occurs until settings
  are recorded. API can return an explicit unconfigured state.
- `medication_inventory.low_stock_threshold numeric(12,3) NULL >= 0` uses that
  row's inventory_unit; no cross-unit threshold or complex conversion is implied.
  Null means no configured quantity threshold. Treatment-deficit alerts require
  an independently valid, deterministic same-unit calculation.
- Device registration is separate from preferences: a later provider-neutral
  `notification_devices` model needs owner, device identifier, push-token material,
  platform, last-seen time, and revocation. Exact token fields, storage protection,
  registration API, and production provider remain open before push integration.

## 32a. Shared invariants and archive rules

All added health-data/session/grant foreign keys, including requested and granted
permissions, default to ON DELETE RESTRICT. Bootstrap cancellation and grant
revocation never delete permission snapshots or their audit history.
Prescription documents additionally enforce the composite ownership FK specified
above; add UNIQUE(id, patient_id) on prescriptions to support it. The future
connection/community FK examples in section 26 do not require baseline tables.

Inventory removal only sets archived_at, preserves quantity/unit and references,
and writes audit atomically. Do not cascade into prescriptions, treatments,
events, or audits. Prescription business status is DRAFT, CONFIRMED, ARCHIVED;
OCR processing status is independent and nullable for manual entry. Document
processing states roll up to the prescription job state; a failed required page
prevents a falsely successful review. Field confirmation never activates treatment.

## Implemented catalog persistence

The six catalog tables in sections 6–11 are implemented by migration
`20260924000300_medicine_catalog`. Catalog foreign keys use RESTRICT; unique barcodes
preserve case and leading zeros. Normalized text uses NFC, whitespace collapse and
lowercase in the catalog boundary. SQL checks require nonempty names, printable
non-space ASCII barcodes, nonnegative image sort order and HTTPS image URLs.
Runtime catalog privileges are SELECT only. Ingredient amounts remain nullable
numeric(12,4); API values are exact decimal strings or null. Real-data ingestion
must enforce the documented normalization before publishing.

## Implemented patient inventory persistence

Section 12 is implemented by `20260924000400_patient_inventory`. Quantities and
nullable thresholds use numeric(12,3), bounded to 0–999999999.999 with NaN rejected.
Optional expiry/purchase dates are SQL DATE in years 0001–9999. Relations to users
and medicines use RESTRICT. Runtime privileges cannot delete rows, change ownership,
replace the medicine link or rewrite created_at. Every mutation writes an audit
in the same transaction; archive preserves the original row. The current API
projection excludes patient_id and archived_at. See
[docs/PATIENT-INVENTORY.md](docs/PATIENT-INVENTORY.md).

## Implemented manual prescription persistence

Sections 13/14 and the document/revision models in section 32 are implemented by
`20260924000500_prescription_drafts`. Manual creation has DRAFT status and null
processing_status/doctor_id. All fourteen allowlisted fields receive initial USER
revisions; unknown values stay null. Edits append typed revisions and synchronize
summary columns. The API projects latest revisions, not unbounded raw history.
D020 adds explicit prescription confirmation from a complete current-field review
snapshot; see docs/TREATMENTS.md. Document metadata supports private attachments
and owner signed downloads; OCR remains unimplemented.
See docs/PRESCRIPTION-DOCUMENTS.md and
[docs/PRESCRIPTION-DRAFTS.md](docs/PRESCRIPTION-DRAFTS.md).

## Implemented notification preferences

Section 32 notification preference persistence is implemented by
`20260925000100_notification_preferences`. All five flags are required without
defaults. Lead time is nullable/nonnegative and bounded by PostgreSQL INTEGER.
Rows are created only on explicit first configuration. See
[docs/NOTIFICATION-PREFERENCES.md](docs/NOTIFICATION-PREFERENCES.md).

## Implemented fixed-time treatments

D020 implements sections 15–18 and stable occurrences with required bounded end
dates, activated_at and explicit fixed schedules. Frequency/duration scalar
projections are omitted in this subset; they are not independently interpreted.
Scope-validation triggers protect occurrence/event denormalization. See
[docs/TREATMENTS.md](docs/TREATMENTS.md) for lifecycle and DST behavior.

### Implemented notification persistence (D021)

The reminder migration adds notifications with occurrence_id UNIQUE, user_id,
type, title, body, data, read_at and created_at. The composite occurrence/recipient
foreign key enforces patient ownership. This slice accepts only DOSE_DUE; the
broader notification enum reserves future categories. See docs/REMINDERS.md.
