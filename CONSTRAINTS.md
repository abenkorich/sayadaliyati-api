# Saydaliyati --- CONSTRAINTS.md

## 1. Identity

-   Email unique after normalization.
-   Phone unique after normalization.
-   At least one supported authentication identifier must exist.

## 2. Coordinates

``` text
latitude >= -90 AND latitude <= 90
longitude >= -180 AND longitude <= 180
```

## 3. Quantities

Inventory quantity must be >= 0 and have an explicit non-null inventory_unit.
Prescription medication quantity must be NULL or > 0. Unknown is NULL; zero is invalid.
Treatment dose quantities must be positive. Inventory low_stock_threshold is
NULL or >= 0 in the same unit as that inventory row. No AI/free-text conversion.

Dose values must be positive when present.

## 4. Dates

``` text
treatment.end_date IS NULL OR treatment.end_date >= treatment.start_date
schedule.end_date IS NULL OR schedule.end_date >= schedule.start_date
```

Prescription validity should not permit
`valid_until < prescription_date` when both are known.

## 5. Confidence

OCR/AI extraction confidence:

``` text
0 <= confidence <= 1
```

## 6. Schedules

Every `days_of_week` value must be:

``` text
0..6
```

The application should define the convention consistently.

Recommended:

``` text
0 = Sunday
1 = Monday
...
6 = Saturday
```

## 7. Sharing

ShareSession bootstrap checks:

```text
max_uses > 0
0 <= use_count <= max_uses
max_attempts > 0
0 <= failed_attempts <= max_attempts
expires_at > created_at
```

Reject redemption when expired, cancelled, consumed, usage exhausted, or attempt
limit reached. Update counters and grant creation atomically under concurrency.
Set consumed_at when use_count reaches max_uses. Rate-limit unmatched guesses
independently of per-session counters. A requested non-null grant expiry must still be in the future at redemption;
otherwise reject without creating a grant or consuming a use. Recipient type must be DOCTOR or PHARMACY
and must match the authenticated recipient role; permissions must be nonempty.

AccessGrant checks: source patient/recipient type must match the session;
recipient_user_id is derived from authentication. expires_at is NULL or later
than granted_at. Permission snapshot cannot exceed requested scope. Every shared
read checks recipient, patient, permission, grant expiry and revocation. Neither
code expiry nor cancellation is a grant revocation. Grant revocation sets
revoked_at and revoked_by together and preserves audit history.

## 8. Uniqueness

Recommended unique constraints:

``` text
medicine_barcodes.barcode

medicine_ingredients(medicine_id, ingredient_id)

share_permissions(share_session_id, permission)
access_grant_permissions(access_grant_id, permission)
access_grants(source_share_session_id, recipient_user_id)
medication_occurrences(schedule_id, local_date)
medication_events(occurrence_id)
prescription_documents(prescription_id, page_number)
prescription_documents(storage_key)
prescription_extracted_fields(prescription_medication_id, field_name, revision)
notification_preferences(user_id)

doctor_connections(patient_id, doctor_id)
```

Doctor connections are future relationship metadata, excluded from baseline
migrations and never an access-grant substitute.

## 9. Patient ownership

All patient-owned records must have a direct patient/user ownership
field where defined by the ERD.

## 10. Referential integrity

Referenced master medicines must not be hard-deleted.

Important health records should default to restricted deletion.

## 11. Audit

Audit rows are append-only from application APIs.

Ordinary application users must never update or delete audit records.

## 12. Sessions, documents, occurrences and lifecycle

- Session expiry follows creation; revoked/expired sessions cannot authorize or
  refresh. Atomic refresh comparison-and-replacement accepts a token only once.
- Prescription document patient matches parent prescription patient via composite
  FK; page_number > 0. Access requires owner or a scoped grant for confirmed data.
- Field revision > 0; confidence is NULL or in [0,1]. Sources and field names are
  allowlisted. Confirmed revisions require confirmed_by and confirmed_at.
- Prescription business state and nullable OCR processing state use separate enums.
- Inventory removal sets archived_at and cannot cascade into prescriptions,
  treatments, medication events, or audit. Default current queries exclude archives.
- V1 schedule_type must be FIXED_TIMES. Weekdays use Sunday=0 through Saturday=6.
- Occurrence ownership follows schedule→treatment medication→treatment. Events
  must agree with occurrence patient, medication and scheduled UTC time. Enforce
  unique occurrence_id even when requests race; timestamp equality is insufficient.
- Notification expiry_lead_days is NULL or a nonnegative integer; preference
  flags are explicit booleans. No row is not consent or a fabricated default row.

Implement constraints through Prisma migrations and transactions during later
feature tasks; this file contains specification only. SQL checks not expressible
in Prisma's schema must still be delivered through reviewed migrations.
