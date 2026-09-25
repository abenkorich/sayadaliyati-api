# 1. Executive Summary

**Saydaliyati currently contains a specification package and visual references, with no application implementation.** The safest starting point is to resolve the foundation contracts, establish minimal development tooling, then build the approved registration-to-inventory journey.

Audit date: September 14, 2026.

The audit covered:

- All 35 requested specifications.
- Five additional Markdown documents, including legacy specifications and asset guidance.
- Both UI reference images.
- Package metadata, checksums, hidden files, and the complete directory tree.

**Verified findings at the time of the audit:**

- 45 files: 40 Markdown documents, two JSON files, two PNG images, and `.DS_Store`.
- One subdirectory: `design-assets/`.
- All 43 entries in `CHECKSUMS-SHA256.json` match their files.
- No application source, dependency manifest, lockfile, migrations, tests, deployment configuration, or environment files.
- Git reports that this directory is not a Git repository.
- No recognizable credentials were found by the targeted secret-pattern scan.

**The audit made no changes to existing files.** No dependencies were installed, migrations generated, services started, or commits made. This report was subsequently saved as `astra_audit.md` at the user's request; the file counts above describe the repository before this report was added.

The principal risks are **specification gaps and contradictions**, particularly around sharing authorization, OCR state, schedules, and inventory units. These must not be resolved implicitly in code.

# 2. Repository Structure

The inspected root is `/Volumes/Data/Workshop/Projects/Saydaliyati`.

```text
Saydaliyati/
├── 39 root-level Markdown specifications
├── PACKAGE-MANIFEST.json
├── CHECKSUMS-SHA256.json
├── .DS_Store
└── design-assets/
    ├── README.md
    ├── a_clean_modern_mobile_app_ui_screenshot_for_a_med.png
    └── a_clean_ui_ux_mockup_collage_of_a_mobile_app_over.png
```

This tree describes the repository before saving this report.

Not present:

- `.git/`, `.github/`, or repository-specific `AGENTS.md`.
- `apps/`, `packages/`, `infrastructure/`, `scripts/`, or `docs/`.
- Backend, mobile, worker, or admin applications.
- Existing navigation, executable UI components, or integrations.

The two PNGs depict Home and broader application concepts. They are visual references, not functioning screens. Their accompanying [asset guidance](design-assets/README.md) explicitly gives the textual design system precedence.

`DEVELOPMENT-WORKFLOW.md` exists under its normal filename; the backslash in the requested list did not represent a missing document.

# 3. Technology Stack Detected

**No executable technology stack is installed or configured in this repository.**

The approved target is described in [DECISIONS.md](DECISIONS.md) and [ARCHITECTURE.md](ARCHITECTURE.md):

- **Mobile:** React Native, Expo, TypeScript, TanStack Query.
- **Navigation:** React Navigation or Expo Router; selection remains open.
- **Backend:** NestJS, TypeScript, REST under `/api/v1`.
- **Database:** PostgreSQL.
- **Queue/cache:** Redis and background workers.
- **Files:** S3-compatible object storage.
- **Deployment:** Docker Compose, Nginx, TLS, monitoring, backups.

Undetermined:

- Package manager and workspace tooling.
- Node, TypeScript, Expo, React Native, NestJS, PostgreSQL, and Redis versions.
- ORM/query layer. [ERD.md](ERD.md), line 6, leaves the implementation choice open, preferably Prisma or TypeORM.
- Admin framework.
- Authentication library, token/session persistence, and password-hashing implementation.
- OCR, AI, notification, storage, and monitoring providers.
- Test runners and CI/CD platform.

`PACKAGE-MANIFEST.json` describes the specification bundle. Its `2.0` version is **not an application or dependency version**.

# 4. Specification Summary

The contract defines an Algeria-first medication-management product with:

- Patient accounts and profiles.
- Medicine search, detail, barcode lookup, and confirmed identification.
- Personal inventory with quantities, units, batches, and expiry.
- Prescription capture, OCR review, and confirmation.
- Treatments, schedules, dose events, reminders, and progress.
- Permission-scoped sharing with professional recipients.
- A controlled AI assistant.
- Audited catalog administration and reviewed Algerian data imports.
- English, French, Arabic RTL, accessibility, and light/dark themes.

The six separate domain concepts are mandatory:

**Medicine → Inventory / Prescription medication / Treatment medication → Schedule → Event.**

Architectural boundaries are consistent:

- Mobile accesses the API, never PostgreSQL directly.
- AI calls authorized typed tools, never arbitrary SQL.
- Patient ownership comes from authenticated server context.
- Uploaded health documents remain private.
- Recognition, OCR, treatment activation, and sharing require confirmation.

The precedence hierarchy is defined in [MASTER-IMPLEMENTATION-SPEC.md](MASTER-IMPLEMENTATION-SPEC.md), line 20. It establishes priorities but also explicitly prohibits silently resolving disagreements.

# 5. Implementation Status Matrix

Statuses below describe executable implementation. Documentation and screenshots do not count as completed features. Risk describes the consequence of implementing or releasing the area without resolving its requirements.

| Area | Status | Evidence | Risk |
| ---- | ------ | -------- | ---- |
| Repository architecture | MISSING | Target monorepo documented; application directories absent | High: no development baseline |
| Database | MISSING | ERD, tables, enums, constraints, and migration plan only | High: unresolved persistence contracts |
| Authentication | MISSING | Auth endpoints specified; no executable auth/session code | High: foundational security dependency |
| Medicine catalog | MISSING | Catalog schema and search contract only; no dataset | High: core workflows lack reference data |
| Inventory | MISSING | Ownership and CRUD specified; no implementation | High: ownership and unit correctness |
| Barcode scanning | MISSING | Workflow and barcode types documented | Medium: device and catalog coverage |
| Medicine identification | MISSING | Candidate matching and confirmation specified | High: incorrect identification |
| Prescriptions | MISSING | Schema and API examples only | High: sensitive records |
| Prescription OCR | MISSING | Extraction pipeline specified; no worker/provider | High: uncertain fields and state gaps |
| Treatments | MISSING | Domain and confirmation flow documented | High: regimen correctness |
| Medication schedules | MISSING | Fixed-time schema plus broader schedule enum | High: incomplete scheduling semantics |
| Medication events | MISSING | Write contract documented; no occurrence enforcement | High: duplicates and incorrect history |
| Notifications | MISSING | Queue/provider workflow only | High: delivery and preference gaps |
| Sharing | MISSING | Code, permission, and redemption specifications only | High: unresolved recipient authorization |
| AI | MISSING | Typed-tool architecture documented | High: authorization and medical boundaries |
| Doctor role | MISSING | Profile, verification, and scoped access described | High: onboarding/access rules incomplete |
| Pharmacy role | MISSING | Recipient workflow described | High: verification and access rules |
| Caregiver role | MISSING | Recipient enum/UI present; role and scope inconsistent | High: undefined access identity |
| Admin | MISSING | Catalog review requirements only | High: privileged changes |
| Localization | MISSING | Three languages required; no translation resources | Medium: incomplete user journeys |
| Arabic RTL | MISSING | Rules and reference image only | Medium: directional and accessibility defects |
| Design system | MISSING | Tokens and components documented; no runtime implementation | Medium: visual/accessibility consistency |
| Security | MISSING | Policies exist; no runtime controls to assess | High before handling user data |
| Audit logging | MISSING | Tables/events specified; no append-only enforcement | High: missing traceability |
| Privacy/data lifecycle | MISSING | Principles documented; workflows not implemented | High: retention/deletion ambiguity |
| Testing | MISSING | Test strategy and acceptance gates only | High: no executable verification |
| Infrastructure | MISSING | Deployment design only; no configuration | High: no reproducible environment |
| Algerian medicine import | MISSING | Staging/review pipeline specified; no sources or importer | High: provenance and publication quality |

# 6. Specification/Code Conflicts

There is no code against which runtime conformance can be established. The actionable findings are specification-to-specification conflicts and missing contracts.

**1. Database column names differ.**

[DATABASE.md](DATABASE.md), line 94, uses `type` for medicine images and barcodes. [TABLES.md](TABLES.md), line 221, uses `barcode_type` and `image_type`. The schema implementation must use an explicitly reconciled naming contract.

**2. Prescription quantity constraints differ.**

[CONSTRAINTS.md](CONSTRAINTS.md) states quantities cannot be negative; [TABLES.md](TABLES.md), line 329, specifies prescription quantity `> 0`. Whether zero is permitted needs an explicit answer.

**3. Redeemed sharing authorization is not fully modeled.**

[SHARING.md](SHARING.md) says the code is not a credential after redemption. The API returns a `shareId`, while [TABLES.md](TABLES.md), line 447, defines no explicit recipient grant/binding record. Access logs identify accessors, but an audit log is not a defined authorization grant.

Also unresolved: whether a session becoming `USED` or its bootstrap code expiring terminates already-redeemed access. The API requires status/expiry checks on shared requests without distinguishing these lifecycles.

**4. Sharing permission semantics are incomplete.**

The enum includes `READ_EXPIRY` and `READ_HISTORY`, but the shared-resource contract does not define their endpoints or field-level effects. `READ_MEDICATIONS` also needs a precise patient-data meaning distinct from inventory and the public catalog. Otherwise expiry/history could leak through broader responses.

**5. Caregiver scope conflicts.**

[SCREEN-SPECIFICATION.md](SCREEN-SPECIFICATION.md), line 797, offers Caregiver as a recipient; sharing enums include it. The user-role enum does not, and [USER-JOURNEYS.md](USER-JOURNEYS.md), line 822, places the caregiver journey in the future. This does not necessarily require a new global role, but the intended identity mapping and MVP scope are undefined.

**6. OCR processing and clinical states are not separated contractually.**

[PRESCRIPTION-OCR.md](PRESCRIPTION-OCR.md), line 110, proposes `UPLOADED`, `PROCESSING`, `REVIEW_REQUIRED`, `CONFIRMED`, and `FAILED`. These differ from `prescription_status`. The scan API's initial example already contains extraction results, while the architecture requires long work in a worker.

A distinct processing-state representation, asynchronous response, and retrieval mechanism are missing.

**7. OCR review requirements exceed the stored model.**

The review flow requires field-level confidence and confirmation; the table supplies medication-level confidence/confirmation. The API also requests provenance such as OCR/AI/USER/DOCTOR without a defined storage representation. Multi-page capture is described, but the baseline prescription has one `image_url`.

**8. Schedule types exceed the demonstrated schema.**

[ENUMS.md](ENUMS.md), line 119, includes `INTERVAL` and `AS_NEEDED`. [TABLES.md](TABLES.md), line 390, requires a local `time`; the API example demonstrates fixed times only.

Interval anchoring, as-needed events, timezone changes, missed-dose thresholds, and occurrence uniqueness require decisions before schedule implementation.

**9. Inventory units are required by persistence but omitted from the screen's required fields.**

[TABLES.md](TABLES.md), line 256, requires `unit`; [SCREEN-SPECIFICATION.md](SCREEN-SPECIFICATION.md), line 362, lists only medicine and quantity as required.

The design system expects structured package units, but medicine strength/package size are text fields. Dose-to-stock conversion cannot safely be inferred from those strings.

**10. Screens depend on missing API contracts.**

- Treatment Detail references `GET /me/medication-events`, but the API contract defines only POST for events.
- Splash loads a profile; Profile supports editing, without corresponding profile endpoints.
- Forgot password has no recovery contract.
- Notification settings lack preference endpoints.
- Professional patient dashboards lack a complete listing/onboarding contract.
- Admin mutations and import review lack detailed endpoint contracts.

See [SCREEN-SPECIFICATION.md](SCREEN-SPECIFICATION.md), line 671, and [API-CONTRACT.md](API-CONTRACT.md).

**11. Notification requirements depend on deferred persistence.**

[NOTIFICATIONS.md](NOTIFICATIONS.md) requires configurable preferences. [TABLES.md](TABLES.md), line 689, defers notification devices/preferences. A minimal persistence approach must be selected before push reminders can satisfy the contract.

**12. Error-code vocabularies disagree.**

The API contract uses `INVALID_CREDENTIALS` and `SHARE_EXPIRED`; [API-IMPLEMENTATION-RULES.md](API-IMPLEMENTATION-RULES.md), line 111, gives `AUTH_INVALID_CREDENTIALS` and `SHARE_CODE_EXPIRED`. These are competing examples within the same precedence tier.

**13. MVP scope and sequencing differ across documents.**

Community requests and persistent doctor connections appear in API/schema deliverables despite future-phase product language. The roadmap and master slice list put AI before sharing; the execution plan puts sharing first. Minimal test/development infrastructure also appears at bootstrap despite later “Testing/Infrastructure” headings elsewhere.

**14. Visual references contain unsupported product implications.**

The images advertise questions about combining medications and show community workflows. Interaction checking is deferred in [PRODUCT.md](PRODUCT.md); those visuals must not expand MVP behavior.

**15. Documentation placement differs from its own instructions.**

[DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md), line 20, points to `/docs`, but authoritative files currently live at the root. This is a packaging mismatch, not justification to move files during implementation.

Package-version, Docker/local-development, API/backend, and security/runtime compatibility remain **unassessable because those implementations do not exist**.

# 7. Security Findings

**No confirmed exploitable application vulnerability was found.** There is no running application, authorization code, upload handler, database configuration, or token implementation in the repository.

Design-level findings:

- **HIGH — Sharing authorization is incomplete.** Recipient binding, post-redemption lifetime, persistent permissions, and field-level scope need definition before shared health-data access.
- **HIGH — Authentication lifecycle is incomplete.** Rotation/revocation is required, but session persistence, recovery, verification, and professional provisioning are not specified sufficiently for implementation.
- **HIGH — Private-file lifecycle is incomplete.** Private storage is consistently required, but ownership metadata, processing states, retrieval, retention, and deletion contracts remain undefined.
- **MEDIUM — Audit requirements lack enforcement detail.** Append-only behavior is required; database privileges, retention, failure handling, and mappings for request/result metadata remain open.
- **MEDIUM — Repository hygiene controls are absent.** No `.gitignore`, automated secret scanning, or CI gate exists. No actual credential exposure was detected.

Requested checks:

- **Direct database exposure / AI database access:** no configuration or executable path found.
- **Missing authorization / ownership bypass / cross-user leakage:** no handlers to test; future controls remain unimplemented.
- **Weak authentication / unsafe tokens:** no implementation to inspect.
- **Unsafe files / uploads:** no storage or upload implementation.
- **Rate limiting:** required in documentation, absent in code.
- **Sensitive logging:** no application logging implementation.
- **Secrets / environment handling:** no environment files; targeted recognizable-secret patterns produced no matches.

The secret scan does not prove the absence of every possible secret. **Committed-secret history cannot be audited because Git history is unavailable.**

# 8. Missing Infrastructure

The repository lacks:

- Git/source-control configuration and remote information.
- Workspace and package-manager configuration.
- Runtime/dependency version pins and lockfile.
- TypeScript, lint, formatting, and test configuration.
- Local PostgreSQL/Redis/object-storage configuration.
- Environment templates and runtime environment validation.
- Dockerfiles, Compose services, private networks, and health checks.
- CI jobs and migration verification.
- Deployment, TLS, and Nginx configuration.
- Backup, restore, retention, and disaster-recovery procedures.
- Monitoring, error tracking, queue visibility, and alerting.
- Provider configuration and anonymized test fixtures.

Local tooling and automated checks are prerequisites for the first slice. Production operations can follow incrementally, with release gates preserved.

# 9. Recommended Architecture Adjustments

**Keep the approved architecture.** No evidence justifies replacing NestJS, Expo, PostgreSQL, Redis, the worker, or the monorepo structure.

Necessary refinements:

1. Record package manager, compatible runtime versions, ORM, and navigation choices before scaffolding.
2. Reconcile schema names, quantity constraints, and required inventory units.
3. Define session lifecycle and server-derived actor context before patient endpoints.
4. Define recipient-bound sharing authorization separately from its bootstrap code.
5. Separate OCR processing state from prescription clinical state.
6. Specify schedule occurrence identity and deterministic unit calculations.
7. Add only the persistence needed for approved reminders, secure files, and import review when those slices begin.
8. Preserve root documentation; establish its authoritative location explicitly.

Do not introduce microservices, a dedicated search engine, automatic stock allocation, or autonomous AI mutations.

# 10. Recommended First Vertical Slice

**Register/sign in → Home → manually find a medicine → confirm selection → add inventory → reload My Pharmacy.**

This is the approved first journey in [MASTER-IMPLEMENTATION-SPEC.md](MASTER-IMPLEMENTATION-SPEC.md), line 151, implemented through manual catalog selection before camera/OCR dependencies.

Implement it in small tasks:

1. Minimal reproducible workspace and verification tooling.
2. Database subset for identity/profile, required catalog entities, inventory, and audit; session persistence after its decision.
3. Authentication and actor context.
4. Catalog browse/search/detail using explicitly labeled development fixtures.
5. Owner-scoped inventory creation and retrieval.
6. Mobile registration/login, Home, manual selection, quantity/unit entry, and inventory list.
7. Relevant validation, authorization, integration, and mobile checks.

Acceptance must demonstrate:

- Inventory persists across reload and reauthentication.
- Another patient cannot read or modify it.
- Client ownership fields are rejected.
- Invalid quantities and nonexistent medicines fail safely.
- Required units are captured without guessing.
- The flow handles loading, empty, error, Arabic RTL, and both themes.

Initially avoid stock sufficiency calculations until unit conversion is defined. Scanning follows once this persistence and authorization path works.

# 11. Implementation Phases

1. **Foundation decisions:** resolve blockers for the first slice and record remaining deferred questions.
2. **Minimal bootstrap:** workspace, version pins, local database, environment validation, tests, and CI.
3. **Database/API foundation:** approved schema subset, constraints, migration tests, validation, errors, and response envelopes.
4. **Authentication:** registration, login, refresh/logout, sessions, actor context, and isolation tests.
5. **Catalog and inventory:** complete the first mobile vertical slice.
6. **Scanner:** exact barcode lookup, confirmation, manual fallback; image identification afterward.
7. **Prescriptions/OCR:** private uploads, worker processing, provenance, review, and confirmation.
8. **Treatments:** approved schedules, event uniqueness, progress, and deterministic stock estimates.
9. **Notifications:** preferences, device registration, retries, idempotency, and timezone tests.
10. **Sharing/professional access:** resolved grants, permissions, code redemption, dashboards, audit, and revocation.
11. **AI:** typed tools over verified domain services, authorization, safety, and multilingual regressions.
12. **Admin:** protected catalog maintenance and import review.
13. **Production readiness:** deployment, monitoring, backups, restore testing, and release gates.
14. **Algerian import:** approved sources, immutable raw records, staging, validation, review, and controlled publication.

Testing, security, privacy, and localization accompany every applicable phase. Community/dependent features remain deferred pending scope decisions.

# 12. Files Likely To Be Created

These are proposed paths, not implementation files created during this audit.

Foundation:

- `docs/decisions/foundation-proposal.md`
- `package.json`
- `tsconfig.base.json`
- `.gitignore`
- `.env.example`
- Workspace configuration and lockfile appropriate to the selected package manager.
- CI configuration appropriate to the selected platform.

First slice:

- `apps/api/` manifests, bootstrap, auth/catalog/inventory modules, and tests.
- `apps/mobile/` manifests, session/navigation, screens, themes, and locale resources.
- `packages/database/` ORM configuration, migrations, fixtures, and constraint tests.
- `packages/types/`, `packages/validation/`, and `packages/api-client/`.
- Local database configuration under `infrastructure/docker/`.

Later phases introduce the approved worker, admin, sharing, medicine, AI, and import directories. Exact framework-dependent filenames should follow the recorded choices.

# 13. Files Likely To Be Modified

**No existing files were modified during this audit.** Later, narrowly scoped approved amendments will likely affect:

- [DECISIONS.md](DECISIONS.md): foundation and domain decisions.
- [ARCHITECTURE.md](ARCHITECTURE.md): selected tooling.
- [DATABASE.md](DATABASE.md), [TABLES.md](TABLES.md), and related database documents: reconciled contracts.
- [API-CONTRACT.md](API-CONTRACT.md): missing endpoints, states, permissions, and errors.
- [SCREEN-SPECIFICATION.md](SCREEN-SPECIFICATION.md): required units and supported workflows.
- Relevant sharing, OCR, notification, privacy, and security specifications.
- Execution plan and checklist as verified implementation progresses.

If the package manifest/checksum files remain maintained integrity records, authorized documentation changes will also require updating them.

# 14. Risks / Open Questions

**Before initial implementation:**

- Which package manager, Node/TypeScript versions, ORM, and navigation system are approved?
- Which schema column names are canonical?
- Is zero prescription quantity valid?
- How are inventory units selected and validated?
- What session persistence and rotation/revocation strategy is approved?
- What exact inventory deletion/audit behavior applies?

**Before later feature slices:**

- What authorizes a recipient after code redemption, and for how long?
- Is caregiver access MVP scope?
- How are professionals provisioned and verified?
- How are OCR field provenance, confirmation, and processing states represented?
- Which schedule types ship initially?
- What defines a valid occurrence, missed dose, expiry warning, and low-stock threshold?
- Which providers and retention terms are acceptable?
- Which Algerian catalog sources and usage rights are approved?

**Audit limitations:**

- Deployment state outside this directory is unknown.
- Git history and remote branches are unavailable.
- No executable tests, builds, dependency audits, or runtime penetration checks were possible.
- Successful checksum verification establishes package consistency, not implementation correctness or legal clearance.

# 15. Proposed Next Codex Task

**Prepare one proposed foundation decision record for the first vertical slice.**

Suggested task:

> Create `docs/decisions/foundation-proposal.md` without modifying existing specifications. Limit it to package manager, runtime compatibility, ORM, navigation, schema naming, quantity/unit rules, session lifecycle, and inventory deletion semantics needed for registration-to-inventory. Cite each governing specification, distinguish recommendations from approved decisions, and list concrete acceptance checks. Leave unresolved product choices explicit. Do not create application code, install dependencies, generate migrations, or make commits.

This keeps the next task small and reviewable. Once those decisions are accepted, the first implementation task should be the minimal workspace and database verification scaffold.
