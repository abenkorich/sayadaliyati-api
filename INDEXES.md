# Saydaliyati --- INDEXES.md

## Core identity

``` sql
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX users_phone_unique
ON users (phone)
WHERE phone IS NOT NULL;
```

## Medicine

``` sql
CREATE INDEX medicines_normalized_name_idx
ON medicines (normalized_name);

CREATE INDEX medicines_generic_name_idx
ON medicines (generic_name);

CREATE INDEX medicines_status_idx
ON medicines (status);

CREATE INDEX medicines_manufacturer_idx
ON medicines (manufacturer_id);

CREATE UNIQUE INDEX medicine_barcodes_barcode_unique
ON medicine_barcodes (barcode);

CREATE INDEX active_ingredients_normalized_name_idx
ON active_ingredients (normalized_name);
```

Consider `pg_trgm` indexes for multilingual fuzzy medicine search after
measuring real query requirements.

## Inventory

``` sql
CREATE INDEX inventory_patient_idx
ON medication_inventory (patient_id);

CREATE INDEX inventory_patient_expiry_idx
ON medication_inventory (patient_id, expiry_date);

CREATE INDEX inventory_patient_medicine_idx
ON medication_inventory (patient_id, medicine_id);

CREATE INDEX inventory_medicine_idx
ON medication_inventory (medicine_id);
```

## Prescriptions

``` sql
CREATE INDEX prescriptions_patient_idx
ON prescriptions (patient_id);

CREATE INDEX prescriptions_doctor_idx
ON prescriptions (doctor_id);

CREATE INDEX prescriptions_date_idx
ON prescriptions (patient_id, prescription_date DESC);

CREATE INDEX prescription_medications_prescription_idx
ON prescription_medications (prescription_id);

CREATE INDEX prescription_medications_medicine_idx
ON prescription_medications (medicine_id);
```

## Treatments

``` sql
CREATE INDEX treatments_patient_status_idx
ON treatments (patient_id, status);

CREATE INDEX treatment_medications_treatment_idx
ON treatment_medications (treatment_id);

CREATE INDEX treatment_medications_medicine_idx
ON treatment_medications (medicine_id);

CREATE INDEX medication_schedules_medication_enabled_idx
ON medication_schedules (treatment_medication_id, enabled);

CREATE INDEX medication_events_patient_scheduled_idx
ON medication_events (patient_id, scheduled_at);

CREATE INDEX medication_events_treatment_scheduled_idx
ON medication_events (treatment_medication_id, scheduled_at);
```

## Connections — FUTURE, excluded from baseline

``` sql
CREATE INDEX doctor_connections_patient_status_idx
ON doctor_connections (patient_id, status);

CREATE INDEX doctor_connections_doctor_status_idx
ON doctor_connections (doctor_id, status);
```

## Sharing

```sql
CREATE INDEX share_sessions_code_hash_idx ON share_sessions (code_hash);
CREATE INDEX share_sessions_patient_expiry_idx ON share_sessions (patient_id, expires_at);
CREATE INDEX share_sessions_expiry_idx ON share_sessions (expires_at);
CREATE UNIQUE INDEX share_permissions_unique ON share_permissions (share_session_id, permission);
CREATE INDEX access_grants_patient_idx ON access_grants (patient_id, revoked_at, expires_at);
CREATE INDEX access_grants_recipient_idx ON access_grants (recipient_user_id, revoked_at, expires_at);
CREATE UNIQUE INDEX access_grants_source_recipient_unique ON access_grants (source_share_session_id, recipient_user_id);
CREATE UNIQUE INDEX access_grant_permissions_unique ON access_grant_permissions (access_grant_id, permission);
CREATE INDEX share_access_logs_patient_created_idx ON share_access_logs (patient_id, created_at DESC);
CREATE INDEX share_access_logs_grant_created_idx ON share_access_logs (access_grant_id, created_at DESC);
CREATE INDEX share_access_logs_accessor_created_idx ON share_access_logs (accessor_id, created_at DESC);
```

## Community — FUTURE, excluded from baseline

``` sql
CREATE INDEX medication_requests_medicine_status_idx
ON medication_requests (medicine_id, status);

CREATE INDEX medication_requests_location_status_idx
ON medication_requests (wilaya, city, status);
```

## Notifications

``` sql
CREATE INDEX notifications_user_read_created_idx
ON notifications (user_id, read_at, created_at DESC);
```

## Audit

``` sql
CREATE INDEX audit_logs_actor_created_idx
ON audit_logs (actor_id, created_at DESC);

CREATE INDEX audit_logs_resource_idx
ON audit_logs (resource_type, resource_id);
```

Do not blindly create every possible index. Re-evaluate indexes using
production query plans and write performance.

## Foundation indexes and uniqueness

```sql
CREATE INDEX sessions_user_idx ON sessions (user_id, revoked_at, expires_at);
CREATE INDEX inventory_patient_active_idx ON medication_inventory (patient_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX prescriptions_id_patient_unique ON prescriptions (id, patient_id);
CREATE UNIQUE INDEX prescription_documents_page_unique ON prescription_documents (prescription_id, page_number);
CREATE UNIQUE INDEX prescription_documents_key_unique ON prescription_documents (storage_key);
CREATE UNIQUE INDEX prescription_fields_revision_unique ON prescription_extracted_fields (prescription_medication_id, field_name, revision);
CREATE UNIQUE INDEX occurrences_schedule_date_unique ON medication_occurrences (schedule_id, local_date);
CREATE INDEX occurrences_patient_time_idx ON medication_occurrences (patient_id, scheduled_at);
CREATE UNIQUE INDEX events_occurrence_unique ON medication_events (occurrence_id);
```

notification_preferences.user_id is a primary key. Avoid duplicating indexes
already supplied by primary/unique constraints. These are SQL examples inside
specifications, not migrations executed by this documentation task.
