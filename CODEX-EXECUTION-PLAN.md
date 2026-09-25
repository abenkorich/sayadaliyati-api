# Saydaliyati --- CODEX-EXECUTION-PLAN.md

Version: 1.0

## 1. Objective

Implement Saydaliyati incrementally using the repository specifications
as the source of truth.

## 2. Phase 0 --- Repository bootstrap

Deliver:

-   pnpm workspace monorepo
-   apps
-   packages
-   strict TypeScript configuration
-   linting
-   formatting
-   test infrastructure
-   Docker development environment
-   CI baseline

Verification:

``` text
install
typecheck
lint
test
build
```

## 3. Phase 1 --- Database

Implement:

-   migrations
-   enums
-   core entities
-   constraints
-   indexes
-   seed development data

Verification:

-   migrations from empty DB
-   rollback strategy where supported
-   constraint tests
-   seed reproducibility

## 4. Phase 2 --- Authentication

Implement:

-   registration
-   login
-   refresh
-   logout
-   actor context
-   role model

Verification:

-   unauthorized requests rejected
-   token/session tests
-   account isolation

## 5. Phase 3 --- Medicine catalog

Implement:

-   medicine search
-   medicine detail
-   barcode lookup
-   catalog repository
-   initial seed

## 6. Phase 4 --- Inventory

Implement:

-   list
-   add
-   edit
-   archive removal with audit preservation
-   expiry
-   quantity
-   batch

E2E:

``` text
login
→ scan/manual select
→ confirm
→ add inventory
→ view inventory
```

## 7. Phase 5 --- Scanner

Implement:

-   camera
-   barcode detection
-   lookup
-   fallback recognition
-   confirmation
-   manual search

Do not integrate expensive AI recognition before the exact barcode path
is stable.

## 8. Phase 6 --- Prescription

Implement:

-   upload
-   storage
-   OCR worker
-   extraction
-   review
-   confirmation

## 9. Phase 7 --- Treatments

Implement:

-   treatment creation
-   FIXED_TIMES schedules with captured timezone
-   stable occurrence IDs and idempotent events
-   progress
-   stock calculations

## 10. Phase 8 --- Notifications

Implement:

-   scheduler
-   Redis queues
-   worker
-   push notifications
-   persisted notification preferences
-   idempotency

## 11. Phase 9 --- Sharing

Implement:

-   permission selection
-   hashed short-lived codes
-   QR
-   redemption into recipient-bound AccessGrant
-   grant-scoped, field-projected access
-   audit
-   revocation

Security testing is mandatory before release.

## 12. Phase 10 --- AI

Implement:

-   `/ai/ask`
-   orchestrator
-   typed tools
-   authorization
-   contextual prompts
-   deterministic calculations
-   safety boundaries
-   regression tests

AI should be integrated after the underlying domain APIs are stable.

## 13. Phase 11 --- Admin

Implement:

-   medicine data management
-   imports
-   review
-   audit

## 14. Phase 12 --- Production infrastructure

Implement:

-   Docker deployment
-   Nginx
-   TLS
-   backups
-   monitoring
-   alerting
-   restore test

## 15. Phase 13 --- Data import

Run controlled Algerian medicine import.

Never import directly into production without staging/review.

## 16. Agent execution protocol

For each phase:

``` text
Read docs
 ↓
Inspect code
 ↓
Plan
 ↓
Implement
 ↓
Test
 ↓
Typecheck
 ↓
Lint
 ↓
Review diff
 ↓
Update docs if behavior changed
```

## 17. Stop conditions

Agent must stop and ask rather than guess when:

-   API contract conflicts with implementation
-   database semantics are ambiguous
-   medical behavior is undefined
-   authorization is unclear
-   external source licensing is unclear
-   destructive migration is required
-   security boundary is uncertain

## 18. Final acceptance

MVP is complete only when critical journeys work end-to-end and security
tests pass.

## 19. Prompt #3 — minimal bootstrap only

Foundation decisions are approved in docs/decisions/foundation-proposal.md.
A later, explicitly requested Prompt #3 should establish pnpm workspace tooling,
strict TypeScript, minimal lint/format/check commands and documentation of the
verified compatible stable version selection. Use Prisma, Expo Router, TanStack
Query, Zod and BullMQ only when their relevant package/slice is bootstrapped;
do not install the entire target stack preemptively.

Phase 0 above is a cumulative milestone. Prompt #3 must not create product
features, schema/migrations, auth, OCR, grants, notification providers, imports,
Docker deployment or CI unless its explicit scope authorizes them. Preserve root
specifications/assets and the historical audit. No Prompt #3 work occurs in this
contract-reconciliation task.
