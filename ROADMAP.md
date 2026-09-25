# Build Roadmap and Acceptance Gates

## Phase 0 --- Foundation

### Deliver

-   monorepo
-   mobile shell
-   API shell
-   worker shell
-   PostgreSQL
-   Redis
-   Docker
-   CI
-   environment configuration
-   migrations
-   shared types
-   validation
-   API client
-   design tokens

### Gate

A clean developer can clone the repository and run the complete stack
locally.

## Phase 1 --- Medicine catalog

Deliver:

-   medicine schema
-   ingredient schema
-   manufacturer schema
-   barcode lookup
-   search
-   detail page
-   admin/import foundation

### Gate

Known medicine records can be found by name and barcode.

## Phase 2 --- My Pharmacy

Deliver:

-   add medicine
-   scan result confirmation
-   quantity
-   batch
-   expiry
-   edit/archive
-   inventory list
-   expiry alerts

### Gate

A patient can maintain a reliable personal medicine cabinet.

## Phase 3 --- Prescription and treatment

Deliver:

-   prescription upload
-   OCR extraction
-   confirmation UI
-   structured prescription
-   treatment creation
-   schedules
-   medication events
-   reminders

### Gate

Patient can complete:

`prescription → treatment → dose schedule → dose event`

## Phase 4 --- AI assistant

Deliver:

-   tool layer
-   medicine Q&A
-   inventory Q&A
-   treatment Q&A
-   prescription explanation
-   safety boundaries
-   evaluation suite

### Gate

AI answers only from authorized structured data and clearly communicates
uncertainty.

## Phase 5 --- Sharing

Deliver:

-   permission model
-   six-character codes
-   QR
-   redemption
-   shared views
-   audit
-   revoke
-   recipient-bound AccessGrant foundation

### Gate

A patient can grant and revoke scoped access and cannot be accessed
outside the scope.

## Phase 6 --- Professional accounts

Deliver:

-   doctor accounts
-   pharmacy accounts
-   verification workflow
-   professional dashboards
-   patient connections

### Gate

Professional workflows are isolated from patient-only workflows.

## Phase 7 --- Availability network (FUTURE, outside baseline)

Deliver:

-   pharmacy inventory
-   availability
-   medication requests
-   geographic discovery
-   response workflow

### Gate

Availability data is useful without exposing unnecessary patient
information.

## Release gates

No production release without:

-   backups
-   restore test
-   authorization tests
-   secure secret handling
-   error monitoring
-   audit logging
-   rate limiting
-   file upload protections
-   privacy/legal review appropriate to deployment
-   multilingual smoke tests
-   accessibility checks

## Foundation task boundary

The phase descriptions are cumulative product milestones, not a single-task scope.
Prompt #3 is limited to pnpm workspace/tooling bootstrap after version compatibility
verification. No feature, migration, provider integration or deployment is implied.
Independent connection workflows and community remain deferred; AccessGrants supply
baseline professional access. Tests/security accompany every applicable slice.
AI/sharing milestone ordering must follow explicit task scope and dependencies;
phase numbers are not permission to bypass either acceptance gate.
