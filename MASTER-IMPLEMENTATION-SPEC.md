# Saydaliyati — MASTER-IMPLEMENTATION-SPEC.md

Version: 2.0
Status: Codex-ready implementation baseline

## Mission

Build Saydaliyati (صيدليتي), an Algeria-first personal medication-management platform.

Core promise:

> All my medicines, in one place.

The application manages medicines, personal inventory, prescriptions, treatments, reminders, secure sharing, and a controlled AI medication assistant.

This specification is the baseline. Future features may be added after the baseline is implemented, tested, and stabilized.

---

## 1. Source-of-truth hierarchy

When documents disagree, use this order:

1. `DECISIONS.md` and its approved [Foundation Decision Record](docs/decisions/foundation-proposal.md)
2. `DATABASE.md` / `MIGRATIONS.md` / `CONSTRAINTS.md`
3. `API-CONTRACT.md` / `API-IMPLEMENTATION-RULES.md`
4. `SECURITY.md` / `PRIVACY-DATA-LIFECYCLE.md`
5. `USER-JOURNEYS.md` / `SCREEN-SPECIFICATION.md`
6. `DESIGN-SYSTEM.md`
7. feature-specific specifications
8. implementation notes

Never silently resolve a contradiction by guessing. Stop and flag it.

---

## 2. Repository target

```text
saydaliyati/
├── apps/
│   ├── mobile/
│   ├── api/
│   ├── worker/
│   └── admin/
├── packages/
│   ├── database/
│   ├── types/
│   ├── validation/
│   ├── api-client/
│   ├── medicine/
│   ├── sharing/
│   └── ai/
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   ├── postgres/
│   └── monitoring/
├── scripts/
│   └── medicine-import/
├── docs/
└── docker-compose.yml
```

---

## 3. Core domain model

Do not merge these concepts:

```text
Medicine
MedicationInventory
PrescriptionMedication
TreatmentMedication
MedicationSchedule
MedicationEvent
```

Relationship:

```text
Medicine
 ├── Ingredients
 ├── Manufacturer
 ├── Barcodes
 └── Images

Patient
 ├── MedicationInventory → Medicine
 ├── Prescription
 │      └── PrescriptionMedication → Medicine
 └── Treatment
        └── TreatmentMedication → Medicine
               ↓
        MedicationSchedule
               ↓
        MedicationEvent
```

---

## 4. Product build order

```text
DATABASE
 ↓
API CONTRACT
 ↓
USER JOURNEYS
 ↓
SCREEN SPECIFICATION
 ↓
DESIGN SYSTEM
 ↓
AUTH
 ↓
MEDICINE CATALOG
 ↓
INVENTORY
 ↓
SCANNER
 ↓
PRESCRIPTION OCR
 ↓
TREATMENTS
 ↓
NOTIFICATIONS
 ↓
SHARING
 ↓
AI
 ↓
ADMIN
 ↓
TESTING
 ↓
INFRASTRUCTURE
 ↓
ALGERIAN MEDICINE IMPORT
```

---

## 5. Vertical-slice rule

Do not build every screen as disconnected mockups.

Build and verify:

### Slice 1
```text
Register → Home → My Pharmacy → Add Medicine
```

### Slice 2
```text
Scan → Identify → Confirm → Inventory
```

### Slice 3
```text
Prescription → OCR → Review → Treatment
```

### Slice 4
```text
Treatment → Reminder → Dose Event → Progress
```

### Slice 5
```text
AI → Typed Tool → Authorized Data → Answer
```

### Slice 6
```text
Share → Permissions → Code → Redeem → AccessGrant → Scoped Access → Revoke
```

Each slice must work end-to-end before the next one becomes the primary focus.

---

## 6. AI boundary

The model is an orchestrator, not a database administrator.

Required:

```text
AI
 ↓
Typed Tool
 ↓
Authorization
 ↓
Domain Service
 ↓
Repository
 ↓
PostgreSQL
```

Forbidden:

```text
AI → SQL → PostgreSQL
```

Initial AI is primarily read/explain/calculate.

No autonomous diagnosis, prescribing, dose changes, or silent mutations.

---

## 7. Safety-critical confirmation

Require explicit user confirmation for:

- medicine recognition before inventory creation
- uncertain OCR fields
- prescription confirmation
- treatment activation
- sharing health data
- revocation
- destructive actions

---

## 8. Sharing security

Six-character code:

```text
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

The code is a short-lived bootstrap authorization mechanism.

Server:

- store only cryptographic hash
- TTL
- rate limiting
- attempt limit
- max uses
- explicit permissions
- audit
- revocation

QR contains only a short-lived redemption token/link, never patient data.

---

## 9. Security priorities

1. unauthorized patient-data access
2. share-code guessing
3. broken file authorization
4. account takeover
5. privilege escalation
6. malicious uploads
7. AI data leakage
8. cross-patient access
9. insecure logs/backups
10. database exposure

---

## 10. Required languages

```text
Arabic
French
English
```

Arabic RTL is first-class.

Use locale-aware dates, numbers and pluralization.

---

## 11. UI direction

Modern, premium, calm, trustworthy.

Reference feel:

```text
Apple Health
+
premium fintech
+
modern pharmacy
```

Avoid generic hospital UI and medical clichés.

Core palette is defined in `DESIGN-SYSTEM.md`.

---

## 12. Initial MVP

Must include:

- account/profile
- medicine database/search/detail
- medicine scanning
- personal inventory
- quantity/expiry/batch
- prescription scan/storage
- prescription → treatment → inventory linking
- reminders/treatment progress
- AI medication assistant
- six-character sharing
- permission selection
- doctor/pharmacy access
- revoke/access logs

---

## 13. Deferred features

Do not implement speculative future features before MVP unless they are required by an existing dependency.

Examples:

- caregiver/family/dependents
- verified doctor network
- pharmacy inventory network
- community availability network
- e-prescriptions
- insurer integrations
- broader institutional integrations

The architecture should not prevent them.

---

## 14. Agent operating protocol

Before coding:

1. Read this document.
2. Read the relevant referenced specifications.
3. Inspect the repository.
4. Identify existing implementation.
5. Produce a focused plan.
6. Implement the smallest coherent slice.
7. Run tests.
8. Run typecheck.
9. Run lint.
10. Review the diff.
11. Update documentation if behavior changed.
12. Report files changed and verification results.

---

## 15. Agent stop conditions

Stop and ask instead of guessing when:

- medical behavior is undefined
- authorization is ambiguous
- API and DB contracts conflict
- destructive migration is required
- security boundary is unclear
- source-data licensing is unclear
- an external provider contract is uncertain

---

## 16. Definition of done

A feature is complete only when applicable:

- implementation exists
- API integration exists
- persistence exists
- validation exists
- authorization exists
- loading state exists
- empty state exists
- error state exists
- accessibility checked
- RTL checked
- dark mode checked
- tests exist
- documentation is synchronized

---

## 17. Future evolution

This baseline is intentionally extensible.

New features should be added by:

```text
New requirement
 ↓
Decision
 ↓
Domain/API impact
 ↓
UX journey
 ↓
Screen specification
 ↓
Security review
 ↓
Implementation
 ↓
Tests
 ↓
Documentation update
```

Do not destabilize the baseline to accommodate hypothetical features.

## 18. Approved foundation reconciliation (2026-09-14)

Root-level specifications remain authoritative and stay in place. Foundation
Decision Record F01–F16 resolves accepted audit findings; its open/deferred items
must not be guessed. The historical astra_audit.md is evidence, not current policy.

ShareSession is bootstrap only; ongoing AccessGrant has independent lifetime,
recipient binding and least-privilege projections. DOCTOR/PHARMACY are V1 recipients;
caregiver/family/community remain deferred. Inventory requires explicit units and
archives on removal. Prescription quantity is positive or null. OCR states are
separate from business states, with field revisions and ordered private documents.
V1 schedules are fixed-time with stable occurrence identity. Notification
preferences are required. Sessions rotate refresh hashes and use secure storage.

Foundation/tooling work precedes the first vertical slice, and tests/security
accompany each slice. Slice labels are journey groupings, not authorization to
implement everything at once. Prompt #3 is only a separately authorized minimal
workspace bootstrap; no application implementation occurs during reconciliation.
