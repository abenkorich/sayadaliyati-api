# Sharing and Trusted Connections

## 1. Goal

Allow a patient to securely share selected medication information with a
doctor or pharmacy without exposing their whole account. Caregiver and family
access remain future-only and are not V1 recipient options.

## 2. One-time share flow

Patient → selects Doctor/Pharmacy → chooses permissions and grant expiry →
creates ShareSession → receives code/QR → recipient authenticates → redeems →
server creates AccessGrant and permission snapshot → consumes session when uses
are exhausted → recipient accesses data through AccessGrant.

## 3. Permissions — canonical projections

Permissions are independent, additive field scopes. None grants another category.
V1 scope is the patient's data in selected categories; no per-record selection UI
is introduced. Explain category scope and grant lifetime explicitly before consent.
Every returned record must belong to that patient.

- READ_MEDICATIONS: medicine identities from current inventory, confirmed
  prescriptions and treatment context. Public catalog details are allowed, but
  no quantities, batches, dates, instructions, documents or events.
- READ_INVENTORY: current quantities/units and minimal medicine identity. Omit
  expiryDate/batchNumber unless READ_EXPIRY is also present. Exclude notes,
  storageLocation, purchaseDate, source, thresholds and archived inventory.
- READ_EXPIRY: current expiry/batch information and minimal medicine identity;
  no quantity/unit unless READ_INVENTORY is also present. Exclude archived rows.
- READ_PRESCRIPTIONS: CONFIRMED prescription metadata, confirmed instructions and
  authorized documents. No drafts, raw OCR revisions, unrelated treatment or
  inventory. Original documents can contain broader prescription information;
  consent must clearly disclose that confirmed original documents are included.
- READ_TREATMENTS: treatment identity/state/dates, regimen and fixed-time schedules.
  Omit medication-event history and adherence/progress derived from events unless
  READ_HISTORY is present; omit stock/expiry without their independent permissions.
- READ_HISTORY: relevant medication events with minimal medicine identity, times
  and outcome. No private event notes, account/security audit, raw OCR revisions,
  prescriptions or stock merely because history is granted.

Apply projections to nested objects as well as top-level fields. None permits
mutation. Minimal medicine identity to label a permitted row does not unlock
unrelated datasets. Never combine grants implicitly to broaden one grantId request.

## 4. Share-code requirements

Suggested alphabet:

`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`

Requirements:

-   cryptographically random
-   hash at rest
-   short TTL
-   attempt limit
-   rate limit
-   max uses
-   recipient type
-   revocable
-   audited

The code is not a credential after redemption.

## 5. AccessGrant and future connections

ShareSession records patient, recipient type, requested permissions, code hash,
code expiry, use/attempt counters, consumed_at and cancelled_at. AccessGrant binds
patient to authenticated recipient_user_id and source session, with permission
snapshot, granted_at, independent nullable expires_at, revoked_at and revoked_by.

Every subsequent read checks AccessGrant, actor/session and patient scope.
Code expiry/cancellation/consumption never revokes an already-created grant.
Patient code cancellation and recipient grant revocation are distinct commands.
The patient explicitly approves grant expiry or no scheduled expiry; never infer
access lifetime from code TTL. Detailed presets/security limits remain open.

Caregiver/family and independent trusted-connection workflows are deferred.
Future doctor_connections metadata never authorizes access without a scoped grant.

## 6. Patient controls

Patient must be able to see:

-   who has access
-   what they can access
-   when access was granted
-   recent access
-   revoke action

## 7. Recipient UX

Doctor/pharmacy:

1.  tap Receive/Connect
2.  enter or scan code
3.  authenticate
4.  see patient identity summary
5.  see only authorized information

## 8. Audit events

Record:

-   SHARE_CREATED
-   SHARE_REDEEMED
-   SHARED_DATA_VIEWED
-   SHARE_SESSION_CANCELLED
-   ACCESS_GRANT_CREATED
-   ACCESS_GRANT_REVOKED
-   CONNECTION_CREATED (future)
-   CONNECTION_REVOKED (future)

## 9. QR safety

QR contains only a short-lived redemption mechanism.

Never encode health information directly.

## 10. Future expansion

Potential later recipients:

-   caregiver
-   family member
-   clinic
-   hospital
-   insurer

Each should have explicit role and permission rules.

## 11. Enforcement and verification

Exactly six characters, using ABCDEFGHJKLMNPQRSTUVWXYZ23456789; secure random
generation and hash-only storage. Rate-limit actors/IPs and known-session attempts.
Counters and grant/audit creation must be transactional. Unmatched guesses need
rate limits independent of session counters. See TABLES.md for keys and counters.

Verify concurrent redemption, same-recipient retry, max uses/attempts, role/patient
isolation, independent code/grant expiry, cancellation versus revocation, and
nested expiry/history omission. Recheck grant access before issuing document URLs;
previously issued URLs retain their bounded lifetime. Do not promise data recall.
