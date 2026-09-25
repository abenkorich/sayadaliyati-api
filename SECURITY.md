# Security and Privacy Specification

## 1. Security posture

Saydaliyati handles potentially sensitive health-related information.
Security is a product requirement, not a later enhancement.

Before production, obtain appropriate Algerian legal/privacy review and
validate applicable requirements, including the personal-data framework
and sector-specific obligations.

## 2. Authentication

-   strong password hashing
-   rotating refresh tokens backed by a server-side revocable Session
-   only refresh-token hashes/derived verification material in PostgreSQL
-   platform secure storage for mobile credentials; never ordinary AsyncStorage
-   access-token expiration
-   atomic token rotation; reject token reuse and honor session revocation/expiry
-   account lockout/rate limiting for abusive attempts
-   MFA as a later enhancement
-   session/device management

## 3. Authorization

Never rely on UI hiding.

Every protected resource must be checked server-side.

A user may access:

-   their own data
-   explicitly authorized dependent data (future; not V1)
-   explicitly shared data
-   role-appropriate professional data

Nothing else.

## 4. Six-character codes

A six-character code is a short-lived bootstrap authorization mechanism.

It is NOT:

-   a permanent user ID
-   a password
-   an API key
-   a long-lived credential

Requirements:

-   use a non-confusing alphabet
-   generate with cryptographically secure randomness
-   store only a cryptographic hash
-   short TTL
-   strict attempt limit
-   rate limiting
-   max-use limit
-   recipient type
-   explicit permission scope
-   bootstrap cancellation and independent grant revocation
-   audit log

Suggested alphabet:

`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`

Example:

`7K4P9X`

## 5. QR

QR should encode a short-lived redemption token/link.

Never encode:

-   prescription contents
-   patient medical history
-   inventory
-   access tokens
-   permanent credentials

## 6. Files

Prescription/package images are untrusted input.

Apply:

-   file type validation
-   size limits
-   safe storage
-   randomized object names
-   malware scanning where appropriate
-   authorization checks
-   signed/limited URLs where appropriate
-   retention rules

## 7. Database

-   database not publicly exposed
-   least-privilege database users
-   encrypted backups
-   migration control
-   production secrets outside source control
-   monitoring
-   restore testing

## 8. Logging

Never log:

-   passwords
-   refresh tokens
-   authorization codes
-   raw prescription images
-   unnecessary medical details

Audit sensitive actions such as:

-   share creation
-   share redemption
-   shared-data access
-   revocation
-   professional verification
-   admin medicine-data changes

## 9. AI safety

AI must:

-   distinguish verified facts from inference
-   cite/identify structured sources internally where useful
-   ask for clarification when data is ambiguous
-   never claim certainty from low-confidence OCR
-   never independently diagnose
-   never change a dose
-   never recommend stopping prescribed therapy as a direct autonomous
    action
-   direct urgent or dangerous situations toward appropriate
    professional/emergency care

## 10. Data lifecycle

Define workflows for:

-   export
-   correction
-   deletion
-   account closure
-   retention
-   backup expiry
-   revoked sharing

## 11. Threat model priorities

Highest priority:

1.  unauthorized patient-data access
2.  share-code guessing
3.  broken object/file authorization
4.  account takeover
5.  privilege escalation
6.  malicious uploaded files
7.  AI data leakage
8.  accidental cross-patient data access
9.  insecure logs/backups
10. database exposure

## 12. Security acceptance gate

No MVP release should occur until automated tests cover ownership and
authorization for every patient-data endpoint.

## 13. Approved foundation enforcement

Actor/user IDs are server-derived. Access tokens reference an active Session;
protected requests must honor revocation. Never accept ownerId/userId/patientId
as authority. No OAuth/social login is added; recovery remains deferred pending
an approved contract.

ShareSession only bootstraps an AccessGrant. The grant binds patient, authenticated
DOCTOR/PHARMACY recipient and permission snapshot. Check recipient, role, scope,
grant expiry/revocation and patient ownership on every shared read and URL issuance.
Code expiry/cancellation/consumption does not revoke grants. Caregiver/family is
future-only. SHARING.md defines recursive field projections.

Ordered prescription documents require private storage keys, verified MIME and
parent/patient ownership. OCR processing and business states stay separate;
field revisions preserve provenance and confirmation actor/time. Inventory removal
archives without cascading into clinical or audit records. Notification settings
must be explicit before delivery; push-token material is never logged.

Authentication algorithms, TTLs, rate budgets and replay behavior are defined by
D014 and [docs/decisions/authentication.md](docs/decisions/authentication.md).
Identifier/professional verification delivery, recovery, signed-URL lifetime,
retention and provider terms remain future gates. See
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for the implemented boundary.

Private prescription attachments now implement MIME/signature/full-raster
validation, bounded buffering and audited owner links lasting at most 60 seconds.
Issued links are bearer capabilities until expiry. Original image metadata is
retained. Production quotas, ingress controls, malware scanning and orphan/purge
operations remain pending. See docs/PRESCRIPTION-DOCUMENTS.md for exact scope.
