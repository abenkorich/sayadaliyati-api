# Saydaliyati --- ROLE-SPECIFICATIONS.md

Version: 1.0

## 1. Patient

Primary capabilities:

-   own profile
-   own medicines
-   own inventory
-   prescriptions
-   treatments
-   reminders
-   AI
-   sharing

Patient is the primary product persona.

## 2. Doctor

Capabilities are relationship-based.

A doctor may access patient information only when:

-   bound to the authenticated recipient by an active AccessGrant
-   within that grant’s patient scope
-   covered by the required permission

Possible future capabilities:

-   view medication history
-   review prescriptions
-   review treatment adherence
-   professional workflows

Do not assume a doctor can edit patient data.

## 3. Pharmacy

Initial:

-   redeem patient share
-   view permitted medication information

Future:

-   pharmacy profile
-   inventory
-   availability
-   patient requests

## 4. Caregiver — FUTURE, not a V1 recipient

A future caregiver/family model must receive scoped access; it is not in V1.

Do not give caregiver unrestricted account access.

## 5. Admin

Admin can manage:

-   medicine master data
-   platform configuration
-   moderation where applicable
-   support tooling
-   audit visibility according to policy

Admin access must itself be protected and audited.

## 6. Authorization rule

Authentication answers:

> Who are you?

Authorization answers:

> What are you allowed to access?

Every sensitive operation requires both.
