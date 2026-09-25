# Saydaliyati --- PROJECT-CHECKLIST.md

## Current implementation — 2026-09-25

The workspace/tooling and API/database foundation are implemented: NestJS health
routes, Prisma identity/audit migrations, local PostgreSQL/Redis, backend
authentication, owner-only profiles, medicine catalog and patient inventory backends
with automated tests. Manual prescription drafts/revisions/archive, private image
attachments/downloads and explicit notification preferences are also implemented.
Full product milestones below remain open; an API health probe is not a completed
authentication or inventory feature. See
[docs/API-DATABASE-FOUNDATION.md](docs/API-DATABASE-FOUNDATION.md).

## Architecture

-   [ ] Monorepo
-   [ ] API
-   [ ] Worker
-   [ ] Mobile
-   [ ] Admin
-   [ ] PostgreSQL
-   [ ] Redis
-   [x] Local private object storage (production provisioning pending)
-   [ ] Nginx

## Database

-   [ ] migrations
-   [ ] constraints
-   [ ] indexes
-   [ ] ownership
-   [ ] audit
-   [ ] backups

## Authentication

-   [x] backend patient registration (self-declared identifiers)
-   [x] backend login
-   [x] backend refresh/rotation/replay revocation
-   [x] backend logout
-   [x] authorization for implemented patient-profile routes
-   [ ] mobile authentication/secure storage
-   [ ] identifier verification and account recovery

## Medicine

-   [x] backend catalog details and repository
-   [x] backend search and pagination
-   [x] exact barcode lookup
-   [x] synthetic local development seed
-   [ ] reviewed real medicine data
-   [ ] mobile catalog UI
-   [ ] identification
-   [x] backend patient inventory CRUD with audited archive removal
-   [x] date-only expiry storage/filtering
-   [x] explicit quantity/unit and per-record low-stock thresholds
-   [ ] mobile inventory UI
-   [ ] stock ledger, treatment deductions and reminders

## Prescription

-   [x] backend manual drafts and owner list/detail
-   [x] append-only manual field edits/confirmation provenance
-   [x] stale-review conflicts, rejected-line history and audited archive
-   [x] explicit manual daily-regimen confirmation and transition
-   [x] Private image attachments to existing drafts (OCR scan upload pending)
-   [ ] OCR
-   [ ] extraction
-   [ ] review
-   [ ] confirmation

## Treatment

-   [x] backend planned treatment creation and explicit activation
-   [x] bounded fixed-time schedules, captured timezone, stable occurrences
-   [x] immutable TAKEN/SKIPPED owner events and retry protection
-   [x] factual scheduled/due/taken/skipped/unrecorded counts
-   [ ] stock calculation

## Notifications

-   [ ] dose
-   [ ] missed
-   [ ] expiry
-   [ ] low stock
-   [x] backend explicit notification preferences (delivery/UI pending)

## AI

-   [ ] orchestrator
-   [ ] typed tools
-   [ ] authorization
-   [ ] safety rules
-   [ ] regression tests

## Sharing

-   [ ] permissions
-   [ ] code
-   [ ] hash
-   [ ] TTL
-   [ ] attempts
-   [ ] QR
-   [ ] redeem
-   [ ] audit
-   [ ] revoke

## Localization

-   [ ] English
-   [ ] French
-   [ ] Arabic
-   [ ] RTL
-   [ ] pluralization
-   [ ] localized dates/times

## Security

-   [ ] TLS
-   [ ] secrets
-   [ ] private DB
-   [ ] private Redis
-   [ ] private files
-   [ ] rate limits
-   [x] JPEG/PNG attachment validation and bounds
-   [ ] authorization tests
-   [ ] backup restore test

## Release

-   [ ] CI
-   [ ] staging
-   [ ] production
-   [ ] monitoring
-   [ ] crash reporting
-   [ ] privacy/legal review
-   [ ] store compliance review

### Reminder backend milestone

- [x] Separate BullMQ dose reminder worker and private inbox API
- [x] Durable occurrence deduplication and current consent/state checks
- [x] Owner-scoped read state and transactional audit
- [ ] Device registration and phone push delivery
- [ ] Android UI connection and physical-device testing

### Android connection milestone

- [x] Expo app, secure authentication, medicine search and existing treatments
- [x] Dose recording, inbox and explicit preference screens
- [ ] Physical-device acceptance testing
- [ ] Mobile treatment creation, inventory and prescription screens
- [ ] Firebase/Expo provisioning, device registration and push delivery

### Web portal milestone (D023)

- [x] Approve Next.js portal scope, independent `saydaliyati-web` repo and mobile theme
- [x] Bootstrap the independent web application and server API configuration
- [x] Port all implemented mobile screens, session behavior and mutations
- [x] Verify browser security, feature parity and responsive accessibility
- [x] Complete production build, automated checks and browser smoke tests
- [x] Include later Home dashboard, My Pharmacy filters and explicit manual stock entry
- [ ] Live API browser acceptance after a real endpoint is configured
- [ ] Safari/Firefox and physical-browser accessibility acceptance
- [ ] Production Redis/HTTPS setup, domain/VPS deployment and shared-IP capacity review

Web verification uses synthetic fixtures and isolated Redis; no real patient data
or remote deployment. See the web repository's `docs/verification.md` for evidence.
