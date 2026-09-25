# Saydaliyati Portal — web application blueprint

Status: implemented in the independent local repository; synthetic browser and session validation completed (2026-09-25). Live API/deployment acceptance remains pending.
Repository/application name: `saydaliyati-web` (this spelling is intentional).
Local target: `/Volumes/Data/Workshop/Projects/saydaliyati-web`.

## Product and architecture

The Saydaliyati Portal is the browser version of the patient mobile app, built with
Next.js, React and strict TypeScript. It is a separate application/repository from
`sayadaliyati-app` (Expo) and `sayadaliyati-api` (NestJS API and worker). The web
portal uses the existing REST API; it does not duplicate domain logic, connect
directly to the medical database, or replace the API/worker. This is a patient
portal, not the future administrative medicine-management console.

Select and pin compatible supported Next.js/React dependencies during bootstrap.
Use a maintained server deployment mode that can receive runtime server environment
variables. Keep the API base URL configurable; no VPS URL or credential is assumed.
A backend-for-frontend layer may adapt browser sessions and proxy requests without
changing medical behavior. Share API contracts via an explicit OpenAPI snapshot,
not imports into sibling repository source trees.

## Required feature parity

Port every feature currently implemented in the mobile source, auditing it before
coding. The starting acceptance checklist is:

- Patient registration using email or international phone, first/last names,
  password, English preference and browser timezone; login and logout.
- Session restoration, expired-session handling, serialized single-use refresh,
  request errors and safe clearing of private state on sign-out/account changes.
- Paginated medicine search, empty states and medicine details; retain synthetic
  DEMO labels and unknown/null values without inventing medicine facts.
- Paginated existing treatment list and detail; immutable stored timezones,
  schedules, instructions, occurrence eligibility and recorded TAKEN/SKIPPED status.
- Confirm before recording TAKEN/SKIPPED; preserve immutable event semantics and
  do not automatically retry an ambiguous medical mutation.
- Paginated reminder inbox, unread indication, read-all, mark-read when opening a
  reminder, and navigation to its associated treatment.
- Explicit notification preferences for all five flags, unconfigured-state UI,
  save feedback and preservation of flags after errors. Only dose inbox reminders
  are currently delivered by the backend.
- Loading/error/empty states, refresh/retry, pagination and recovery on reconnect
  or returning to the page; protect against late responses after navigation/logout.

Treatment creation, prescription screens, profile editing and
phone push are not implemented today; they remain future product scope rather
than being mislabeled as missing parity. Broader product specifications still
apply when those capabilities are developed later. Do not claim web push support
or native device registration as part of this port.

## Theme and responsive UX

Keep the mobile visual language for the first web release:
primary #087F7B; primary-soft #DDF4F1; background #F8FAF9; ink #172321;
secondary text #667371; borders #E4EAE8; white cards. Cards use approximately 16px
radii and controls 8px, with spacious typography and clear medication hierarchy.
Adapt the four mobile areas (Treatments, Medicines, Inbox, Settings) to desktop and
small browser screens. Retain the Saydaliyati identity and English UI initially.
Provide semantic navigation, labels, keyboard focus, accessible confirmations and
readable error messages. Do not introduce a separate portal rebrand.

## Browser security and validation

Adapt secure session storage to the browser/server architecture; do not copy
SecureStore semantics into localStorage. Keep refresh credentials inaccessible to
browser JavaScript (for example an HttpOnly cookie or server-side session), use
Secure cookies in HTTPS deployments, constrain cookie scope and protect mutations
against CSRF. Never expose secrets through NEXT_PUBLIC variables. Account for
concurrent refresh across tabs/server requests and failed/lost rotation responses.
Do not cache or statically publish private health responses across users. Keep
owner authorization in the API and preserve its canonical error contracts.

Verify authentication/session boundaries, ownership, mutation behavior and UI
parity with meaningful automated tests. Run build, types and lint, then browser
checks at desktop and mobile widths against mocks and/or isolated synthetic test
accounts. Document what was actually verified and any unavailable live/device
checks. No push, remote deployment or real-patient data is required for this task.

## Delivery

Create the independent local Next.js repository with its own lockfile, commands,
API configuration example, tests, Docker/runtime notes and README. Preserve the
existing API/mobile repositories and original project. User will manage remote
hosting/domain configuration unless separately authorized. Use parallel agents
for bounded implementation/review subtasks when useful; integrate and test their
work in the new task. No routine confirmation is needed for this authorized scope.

## Implementation delivery — 2026-09-25

Delivered locally at `/Volumes/Data/Workshop/Projects/saydaliyati-web` with pinned
Next.js 16.3.6, React 19.3.0, strict TypeScript, an independent lockfile, OpenAPI
snapshot, standalone build, Dockerfile and runtime configuration documentation.

The later mobile update is included: personalized Home using actual profile and
inventory/treatment totals, recent stock, My Pharmacy All/Low stock/Expired filters
with pagination, explicit quantity/unit/optional-expiry manual stock entry from
catalog details, mobile Home/Pharmacy/Add/Treatments/More navigation and a quick-action
dialog. Original Medicines/Treatments/Inbox/Settings capabilities remain available.
Registration gives field-specific names and Unicode-aware 15–128-character password
feedback without trimming passwords or exposing duplicate-account existence.

Browser sessions use opaque HttpOnly cookies and shared Redis CAS rotation, including
consume-before-refresh, logout races, nonsecret account-generation request binding,
exact-Origin CSRF checks and private no-store responses. React never receives API
tokens. The API remains the domain/ownership authority.

Local validation includes lint, strict types, production build/standalone smoke,
14 server/security tests including real isolated Redis and mocked HTTP routes,
and desktop/mobile Chromium parity tests. Full results and limitations live in the
web repository's `docs/verification.md` and `docs/mobile-parity.md`.

Pending: live API end-to-end acceptance when a real URL is supplied, Safari/Firefox
and physical-browser acceptance, production Redis/HTTPS/reverse-proxy setup and
operator review of upstream shared-IP rate limits. No remotes, pushes, VPS changes
or deployments were performed. Treatment creation, prescription workflows,
profile editing, recovery, camera scanning, AI assistance, community sharing and
push remain future scope; basic manual inventory is now implemented.
