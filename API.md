# API Specification

## 1. Response envelope

Success:

``` json
{
  "data": {},
  "meta": {}
}
```

Error:

``` json
{
  "error": {
    "code": "SHARE_CODE_EXPIRED",
    "message": "This sharing code has expired."
  }
}
```

## 2. Authentication

``` http
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

Use short-lived access tokens, rotating refresh tokens and server-side revocable
Sessions. Persist only hashes; mobile uses platform secure storage, not AsyncStorage.

## 3. Medicines

``` http
GET /medicines
GET /medicines/:id
GET /medicines/search?q=
GET /medicines/barcode/:barcode
POST /medicines/identify
```

`POST /medicines/identify` may accept barcode/image metadata and return
candidate matches. It must not silently create or modify master medicine
records.

## 4. Inventory

``` http
GET /me/inventory
POST /me/inventory
GET /me/inventory/:id
PATCH /me/inventory/:id
DELETE /me/inventory/:id
```

All inventory operations enforce patient ownership.

## 5. Prescriptions

``` http
GET /me/prescriptions
GET /me/prescriptions/:id
POST /me/prescriptions
POST /me/prescriptions/scan
PATCH /me/prescriptions/:id
DELETE /me/prescriptions/:id
```

Scan endpoint creates an extraction candidate. User confirmation
converts candidate values into confirmed structured data.

## 6. Treatments

``` http
GET /me/treatments
GET /me/treatments/:id
POST /me/treatments
PATCH /me/treatments/:id
GET /me/medication-events
POST /me/medication-events
```

## 7. Sharing

``` http
POST /me/shares
POST /shares/redeem
GET /me/shares/active
DELETE /me/shares/:id
GET /me/shares/audit
GET /me/access-grants
GET /me/access-grants/:grantId
DELETE /me/access-grants/:grantId
GET /shared/access-grants
```

Shared-resource endpoints must enforce permissions:

``` http
GET /shared/:grantId/medications
GET /shared/:grantId/inventory
GET /shared/:grantId/prescriptions
GET /shared/:grantId/treatments
```

## 8. Example share creation

``` json
{
  "recipientType": "DOCTOR",
  "expiresIn": 900,
  "grantExpiresAt": null,
  "maxUses": 1,
  "permissions": [
    "READ_MEDICATIONS",
    "READ_INVENTORY",
    "READ_PRESCRIPTIONS"
  ]
}
```

## 9. Example response

``` json
{
  "data": {
    "id": "share-uuid",
    "code": "7K4P9X",
    "expiresAt": "2026-09-12T22:30:00Z"
  }
}
```

The plaintext code is returned only at creation time.

## 10. Validation

Use DTO/schema validation at the API boundary.

Reject:

-   invalid UUIDs
-   impossible dates
-   negative inventory quantities
-   unsupported permissions
-   unauthorized patient IDs
-   malformed codes
-   expired shares

## 11. Authorization pipeline

``` text
authenticate
    ↓
identify actor
    ↓
authorize role
    ↓
check ownership/relationship
    ↓
check permission
    ↓
controller/service
    ↓
audit sensitive action
```

## 12. API design rules

-   idempotency where appropriate
-   pagination for collections
-   stable error codes
-   no internal stack traces in production
-   no raw SQL exposed to clients
-   never trust client-provided ownership fields
-   use transactions for multi-table writes
-   return only fields appropriate to the caller

## 13. Foundation contract alignment

API-CONTRACT.md section 20 is the canonical error vocabulary; all paths use /api/v1.
GET/PATCH /me/profile serves the authenticated patient; recovery is deferred.
GET/PATCH /me/notification-preferences persists explicit settings. Inventory
requires medicineId, quantity and controlled unit; DELETE archives. Prescription
quantity is > 0 or null. Scan takes ordered pages and returns 202 with separate
business status/processingStatus; poll detail.

ShareSession routes create/list/cancel codes only; AccessGrant routes manage
ongoing access. Code expiry/cancellation never revokes a grant. Shared routes
use grantId and SHARING.md field projections, including separate expiry/history
and confirmed document downloads. V1 recipients: DOCTOR/PHARMACY. Medication
POST uses occurrenceId, not timestamp identity. Community, caregiver/family and
independent connection workflows are deferred.
