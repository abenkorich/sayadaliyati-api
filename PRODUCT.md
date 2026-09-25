# Product Specification

## 1. Vision

Saydaliyati means "My Pharmacy" and should feel like a personal digital
pharmacy that is always with the patient.

Tagline:

**All my medicines, in one place.**

Arabic:

**كل أدويتي في مكان واحد**

French:

**Tous mes médicaments, au même endroit.**

## 2. Primary user value

A patient should be able to:

1.  scan a medicine package
2.  confirm what was identified
3.  add it to My Pharmacy
4.  scan or enter a prescription
5.  turn it into a treatment
6.  receive dose reminders
7.  know remaining stock and expiry
8.  ask Saydaliyati questions about their medicines
9.  securely share selected information with a doctor or pharmacy

## 3. Core concepts

### Medicine

A master pharmaceutical product.

Examples of attributes:

-   brand name
-   generic name
-   active ingredients
-   strength
-   dosage form
-   route
-   manufacturer
-   package size
-   registration number
-   barcodes
-   package images
-   official information references

### Medication inventory

A physical quantity owned or held by a patient.

It may have:

-   quantity and explicit controlled unit
-   batch
-   expiry
-   purchase/source
-   storage location
-   notes

### Prescription

A prescription document and its structured medication instructions.

### Treatment

A patient-specific course of medication derived from a prescription or
created manually.

### Treatment medication

A medicine inside a treatment with dose, frequency, schedule and
duration.

### Medication event

The actual occurrence of a scheduled dose:

-   taken
-   missed
-   skipped

## 4. Personas

### Patient

Primary consumer. Wants simplicity, reminders and confidence.

### Caregiver — future

Manages medication for a dependent with explicit authorization.

### Doctor

Views patient-shared information and relevant treatment/prescription
context.

### Pharmacy

Views patient-shared information and, in later phases, manages pharmacy
inventory and availability.

### Admin/data operator

Maintains medicine master data, reviews imports and handles operational
controls.

## 5. MVP scope

-   account and profile
-   medicine search
-   medicine detail
-   barcode scanning
-   package identification
-   personal inventory
-   quantity, explicit unit, batch and expiry
-   prescription capture
-   prescription OCR/extraction
-   user confirmation
-   treatment creation
-   schedules
-   reminders
-   medication events
-   expiry/low-stock alerts
-   AI medication assistant
-   controlled six-character sharing
-   QR sharing
-   doctor/pharmacy recipient roles
-   access logs
-   revoke access

## 6. UX principle

The user-facing information architecture should remain simple even
though the backend is complex:

-   Home
-   My Pharmacy
-   Scan (prominent action)
-   Treatments
-   More

Sharing is accessible from Home/contextual actions and More.

## 7. Future phases

### Phase 2

-   family/dependent profiles
-   verified doctor accounts
-   trusted persistent connections
-   advanced treatment management
-   interaction checking
-   stronger AI context

### Phase 3

-   verified pharmacy accounts
-   pharmacy inventory
-   medicine availability
-   reservation/contact workflows

### Phase 4

-   community medication requests
-   nearby availability signals

### Phase 5

-   broader professional network
-   organizations
-   insurers
-   electronic prescription integrations
-   official integrations where legally and technically available

## 8. Success criteria

The MVP is successful when a new patient can complete:

`install → account → scan medicine → confirm → add inventory → scan prescription → confirm → create treatment → receive reminder → record dose → share selected data`

without needing an administrator.

## 9. Foundation scope boundary

V1 recipient types are DOCTOR and PHARMACY with explicit AccessGrants.
Caregiver/family, community requests, independent trusted-connection workflows,
INTERVAL/AS_NEEDED schedules and complex unit conversion are deferred. Professional
verification/provisioning policy is required before the sharing slice; later
network expansion does not permit unverified or unrestricted baseline access.
