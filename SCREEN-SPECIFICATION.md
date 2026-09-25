# Saydaliyati --- SCREEN-SPECIFICATION.md

Version: 1.0 Status: UI implementation baseline

------------------------------------------------------------------------

# 1. Purpose

This document converts the user journeys into implementation-ready
screen specifications.

Every screen defines:

-   purpose
-   entry points
-   layout
-   components
-   data
-   API dependencies
-   user actions
-   navigation
-   loading state
-   empty state
-   error state
-   confirmation requirements
-   accessibility
-   Arabic RTL requirements

The implementation must not invent product behavior that contradicts the
API, database, security or user-journey specifications.

------------------------------------------------------------------------

# 2. Global Mobile Shell

## Navigation

Primary bottom navigation:

``` text
Home
My Pharmacy
Scan
Treatments
More
```

Scan is visually prominent.

## Global requirements

-   safe-area aware
-   keyboard-safe
-   dynamic type
-   accessible touch targets
-   light/dark themes
-   Arabic RTL
-   French
-   English
-   consistent loading/error patterns
-   no raw backend errors
-   destructive actions require confirmation

------------------------------------------------------------------------

# 3. Splash Screen

## Purpose

Initialize the application.

## Components

-   Saydaliyati logo
-   subtle loading indicator

## Logic

``` text
Launch
 ↓
Initialize local state
 ↓
Check session
 ↓
Load minimal profile
 ↓
Route
```

Routes:

``` text
Authenticated → Home
Unauthenticated → Onboarding/Login
```

Do not block indefinitely if an optional service is unavailable.

------------------------------------------------------------------------

# 4. Onboarding

## Purpose

Explain the product in three or four concise screens.

## Components

-   illustration
-   headline
-   supporting text
-   progress indicator
-   Continue
-   Skip

## Content

### 1

Your medicines, organized.

### 2

Never lose track of a dose.

### 3

Know what you have.

### 4

Share when you choose.

------------------------------------------------------------------------

# 5. Login

## Components

-   email/phone
-   password
-   show/hide password
-   Sign in
-   Password recovery is deferred; do not show an actionable Forgot password link
-   Create account

## API

``` http
POST /api/v1/auth/login
```

## States

Loading: disable submit.

Error: show human-readable authentication error.

Success: store persistent credentials in platform secure storage (never ordinary
AsyncStorage), route to Home, and load GET /api/v1/me/profile. Expired/revoked
sessions return to sign-in and clear account-scoped cached data.

------------------------------------------------------------------------

# 6. Registration

## Components

-   name
-   email/phone
-   password
-   language
-   timezone
-   terms/privacy acknowledgement
-   Create account

## API

``` http
POST /api/v1/auth/register
```

Do not collect unnecessary health information.

------------------------------------------------------------------------

# 7. Home

## Purpose

The highest-value screen.

## Layout

``` text
Header
Greeting

My Pharmacy summary
Current treatment
Next dose
Alerts
Quick actions
Ask Saydaliyati
Recently added
```

## Components

### Header

-   greeting
-   profile/avatar
-   notification indicator

### My Pharmacy summary

``` text
17 medicines
2 expiring soon
1 low stock
```

Tap → My Pharmacy.

### Current treatment

``` text
Amoxicilline 500 mg
Day 4 / 7
██████░
```

Tap → Treatment detail.

### Next dose

``` text
20:00
Amoxicilline 500 mg
[Mark as taken]
```

API:

``` http
GET /api/v1/me/treatments
GET /api/v1/me/inventory
GET /api/v1/me/notifications
POST /api/v1/me/medication-events
```

### Quick actions

-   Scan medicine
-   Add prescription
-   Share

### AI

``` text
Ask Saydaliyati
What do you want to know?
```

### Empty state

If no medicines:

``` text
Your pharmacy is empty.

Add your first medicine by scanning its package.

[Scan medicine]
```

------------------------------------------------------------------------

# 8. My Pharmacy

## Components

-   page title
-   search
-   filter
-   sort
-   medicine list
-   Scan action

## Filters

``` text
All
Expiring soon
Low stock
Recently added
```

## API

``` http
GET /api/v1/me/inventory
```

## Card

``` text
Package image
Medicine name
Strength
Quantity
Expiry
Status
```

## Empty

``` text
No medicines yet.
[Scan medicine]
```

------------------------------------------------------------------------

# 9. Medicine Detail

## Layout

``` text
Package image

Medicine name
Strength / form

Stock
Expiry
Batch

Active ingredients
Manufacturer

About this medicine

[Ask Saydaliyati]
[Edit]
```

## API

``` http
GET /api/v1/me/inventory/:id
GET /api/v1/medicines/:id
```

## Security

The owner uses /me/inventory routes. A professional uses grant-scoped shared
routes and receives only permitted fields; an authenticated recipient cannot
use the patient owner endpoint.

------------------------------------------------------------------------

# 10. Add/Edit Inventory

## Fields

Required:

-   medicine
-   quantity
-   unit (controlled inventory_unit; localize its label)

Optional/expected where available:

-   expiry
-   batch
-   storage location
-   source

## API

``` http
POST /api/v1/me/inventory
PATCH /api/v1/me/inventory/:id
```

## Validation

``` text
quantity >= 0
expiry valid date
```

Never trust a client-supplied owner ID.

------------------------------------------------------------------------

# 11. Scanner

## Purpose

Primary medicine-entry workflow.

## Layout

``` text
Camera preview

Scanning frame

Barcode guidance

Flash
Gallery
Manual search
```

## Logic

``` text
Open camera
 ↓
Detect barcode
 ↓
Lookup
```

API:

``` http
GET /api/v1/medicines/barcode/:barcode
```

If no barcode:

``` text
Use image recognition
```

------------------------------------------------------------------------

# 12. Scan Result

## High confidence

``` text
We found this medicine

[Package image]
Amoxicilline 500 mg
Manufacturer

[Confirm]
[Search another]
```

## Low confidence

``` text
We couldn't confidently identify this medicine.

Possible matches:
...
[Choose]
[Search manually]
```

Never automatically add an uncertain result.

------------------------------------------------------------------------

# 13. Manual Medicine Search

## Search input

Supports:

-   brand
-   generic
-   active ingredient
-   barcode
-   Arabic
-   French
-   transliterated Arabic

## API

``` http
GET /api/v1/medicines/search
GET /api/v1/medicines
```

## Result

Show:

-   medicine name
-   strength
-   form
-   manufacturer
-   package image where available

------------------------------------------------------------------------

# 14. Prescription Capture

## Layout

``` text
Take photo
Upload image
```

Camera guidance:

-   good lighting
-   keep document flat
-   include all pages
-   avoid glare

## API

``` http
POST /api/v1/me/prescriptions/scan
```

Upload ordered pages; HTTP 202 returns QUEUED processingStatus separately from
DRAFT business status. Document URLs remain private and authorized.

------------------------------------------------------------------------

# 15. Prescription Processing

## Purpose

Show progress without implying certainty.

``` text
Reading prescription
Finding medicines
Extracting instructions
Preparing review
```

Poll GET /api/v1/me/prescriptions/:id. Processing states are UPLOADED, QUEUED,
PROCESSING, REVIEW_REQUIRED, COMPLETED, FAILED; business state is independently
DRAFT, CONFIRMED or ARCHIVED. Manual entry has no processing state.

Never expose internal OCR/provider details.

------------------------------------------------------------------------

# 16. Prescription Review

## Layout

Two-column concept on large screens; stacked on mobile:

``` text
Original image
        ↓
Extracted information
```

Medication card:

``` text
Medicine
Strength
Dose
Frequency
Duration

Confidence

[Confirm]
[Edit]
[Reject]
```

## Critical rule

Every uncertain field must be editable and explicitly confirmed.

The prescription is not considered confirmed until required fields have
been reviewed.

------------------------------------------------------------------------

# 17. Prescription Detail

## Components

-   prescription image/document
-   date
-   prescriber information if available
-   medications
-   extraction status
-   treatment link

Actions:

``` text
Create treatment
Edit
Archive
```

API:

``` http
GET /api/v1/me/prescriptions/:id
PATCH /api/v1/me/prescriptions/:id
```

------------------------------------------------------------------------

# 18. Treatment List

## Components

Tabs or filters:

``` text
Active
Planned
Completed
```

Treatment card:

``` text
Amoxicilline
Day 4 / 7
Next dose 20:00
Progress
```

API:

``` http
GET /api/v1/me/treatments
```

------------------------------------------------------------------------

# 19. Treatment Detail

## Layout

``` text
Treatment name

Progress
Day 4 / 7

Medication
Dose schedule

Today's doses
08:00 ✓
14:00 ✓
20:00 ○

Inventory
18 capsules remaining

[Ask Saydaliyati]
```

API:

``` http
GET /api/v1/me/treatments/:id
GET /api/v1/me/medication-events
```

------------------------------------------------------------------------

# 20. Medication Event

## Mark as taken

User action:

``` text
[Mark as taken]
```

API:

``` http
POST /api/v1/me/medication-events
```

Record:

-   treatment
-   treatment medication
-   schedule/event
-   occurrence time
-   status

Use the server-provided occurrenceId and enforce database uniqueness. Identical
retries return the existing event; conflicting retries require a visible conflict
state and never silently replace history.

------------------------------------------------------------------------

# 21. Treatment Creation

## Layout

``` text
Medicine
Dose
Frequency
Start
End
Schedule

[Confirm treatment]
```

The UI records treatment instructions supplied by the user/prescription.

It must not imply that Saydaliyati independently prescribed the regimen.

------------------------------------------------------------------------

# 22. Ask Saydaliyati

## Entry points

-   Home
-   Medicine detail
-   Treatment
-   Prescription

## UI

``` text
Ask Saydaliyati

Suggested questions

Conversation

Input
Send
```

## API

``` http
POST /api/v1/ai/ask
```

## Context

The client may provide contextual entity IDs, but the server must
enforce authorization.

The AI layer accesses typed tools only.

------------------------------------------------------------------------

# 23. AI Response Safety UI

When appropriate, show:

``` text
Based on your Saydaliyati data
```

For uncertainty:

``` text
I couldn't verify that from your data.
```

For medical advice beyond supported scope:

``` text
I can explain the information I have, but I can't diagnose or change your treatment.
```

Do not make the AI look like an autonomous clinician.

------------------------------------------------------------------------

# 24. Sharing --- Start

## Layout

``` text
Share your medication information

Who are you sharing with?

○ Doctor
○ Pharmacy

[Continue]
```

------------------------------------------------------------------------

# 25. Sharing --- Permissions

## Layout

``` text
Choose what they can access

☑ Medicines
☑ Inventory
☑ Expiry
☐ Prescriptions
☐ Treatments
☐ History

Access duration: explicitly confirm a date/time or Until revoked

[Generate secure code]
```

Avoid "share everything" as the default.

------------------------------------------------------------------------

# 26. Sharing --- Code

## Layout

``` text
Your secure code

7K4P9X

Code expires in 10 minutes

[Show QR]
[Copy code]
[Cancel]
```

The code is a short-lived bootstrap mechanism.

Server-side:

-   store only hash
-   TTL
-   attempt limit
-   rate limit
-   max uses
-   scope
-   audit
-   revocation

Never put patient medical data in the QR.

------------------------------------------------------------------------

# 27. Sharing --- Redeem

Recipient screen:

``` text
Enter patient sharing code

[ _ _ _ _ _ _ ]

[Continue]
```

Errors:

``` text
Invalid code
Code expired
Too many attempts
Code already used
Access revoked
```

Never reveal more information than necessary.

------------------------------------------------------------------------

# 28. Sharing & Access

Patient view separates:

- Pending codes: remaining redemption lifetime, permissions, and Cancel code.
- Active recipient access: recipient, permissions, grant expiry or “Until revoked”,
  and Revoke access with confirmation.

```http
GET /api/v1/me/shares/active
DELETE /api/v1/me/shares/:id
GET /api/v1/me/access-grants
GET /api/v1/me/access-grants/:grantId
DELETE /api/v1/me/access-grants/:grantId
GET /api/v1/me/shares/audit
```

Cancelling/expiring a code prevents new redemption only. It does not revoke an
existing grant. Revocation blocks subsequent grant-authorized requests; it cannot
recall already-downloaded data. Do not label the code countdown as access expiry.

------------------------------------------------------------------------

# 29. Notifications

## Types

-   dose due
-   missed dose
-   expiry
-   low stock
-   prescription processing
-   sharing
-   system

## Screen

``` text
Notifications

Today
Dose due
...

Earlier
...
```

API:

``` http
GET /api/v1/me/notifications
PATCH /api/v1/me/notifications/:id/read
PATCH /api/v1/me/notifications/read-all
```

------------------------------------------------------------------------

# 30. More / Settings

## Sections

``` text
Profile
Language
Notifications
Privacy
Sharing & access
Security
Help
About
Sign out
```

Arabic, French and English must be changeable without corrupting layout.

------------------------------------------------------------------------

# 31. Profile

Display/edit:

-   name
-   preferred language
-   timezone
-   account information

Do not expose internal IDs.

GET/PATCH /api/v1/me/profile supports patient name, language and timezone. Account
email/phone are read-only here. Do not expose role/verification changes. Existing
treatment schedules do not silently shift when profile timezone changes.

------------------------------------------------------------------------

# 32. Doctor Dashboard

## Navigation

``` text
Dashboard
Patients
Profile
```

## Patient list

Only authorized connected/shared patients.

Patient view:

``` text
Medication overview
Inventory
Prescriptions
Treatments
```

Access must be enforced server-side.

------------------------------------------------------------------------

# 33. Pharmacy Dashboard

Initial:

``` text
Shared patients
Profile
```

Future:

``` text
Inventory
Availability
Requests
```

Do not expose patient information merely because the pharmacy is
authenticated.

------------------------------------------------------------------------

# 34. Community Availability

Future screen:

``` text
Medicine
Location
Availability request
Responses
```

Do not expose exact patient identity publicly.

Initial system should focus on availability signals rather than medicine
transfer.

------------------------------------------------------------------------

# 35. Global Components

Reusable components should include:

``` text
MedicineCard
InventoryCard
TreatmentCard
PrescriptionCard
StatusBadge
ExpiryBadge
QuantityControl
DoseTimeline
ProgressBar
SearchBar
FilterChips
EmptyState
ErrorState
LoadingSkeleton
ConfirmationSheet
PermissionSelector
ShareCode
QrDisplay
AiPromptCard
```

------------------------------------------------------------------------

# 36. Global State Rules

Every screen must explicitly handle:

``` text
initial loading
refreshing
success
empty
error
retry
```

Mutation actions additionally handle:

``` text
submitting
success
validation error
authorization error
conflict
network failure
```

------------------------------------------------------------------------

# 37. Accessibility

Minimum requirements:

-   touch targets approximately 44×44pt or larger
-   semantic labels
-   screen-reader support
-   dynamic font scaling
-   sufficient contrast
-   do not communicate status by color alone
-   logical focus order
-   RTL-aware layout
-   reduced-motion support

------------------------------------------------------------------------

# 38. RTL Rules

Arabic is a first-class language.

Do not implement RTL by simply mirroring screenshots.

Use logical layout properties:

``` text
start / end
marginStart / marginEnd
paddingStart / paddingEnd
```

Avoid hard-coded left/right positioning unless genuinely visual.

Numbers, medicine names and Latin text may require directional
isolation.

------------------------------------------------------------------------

# 39. Loading Rules

Prefer skeletons for content screens.

Use spinners for short actions.

Never freeze the entire screen unnecessarily.

For OCR/AI processing, show meaningful progress stages.

------------------------------------------------------------------------

# 40. Error Rules

Use human language.

Bad:

``` text
AxiosError: Request failed with status code 500
```

Good:

``` text
We couldn't load your medicines.
Please try again.

[Retry]
```

------------------------------------------------------------------------

# 41. Navigation Contract

Every screen must define:

``` text
route name
params
entry points
allowed back behavior
success destination
cancel destination
```

Do not pass sensitive medical data through navigation parameters when an
authorized ID/reference is sufficient.

------------------------------------------------------------------------

# 42. API-to-Screen Traceability

Core mapping:

``` text
Home
 ├── GET /me/inventory
 ├── GET /me/treatments
 ├── GET /me/notifications
 └── POST /me/medication-events

My Pharmacy
 ├── GET /me/inventory
 ├── POST /me/inventory
 ├── PATCH /me/inventory/:id
 └── DELETE /me/inventory/:id

Medicine
 ├── GET /medicines/:id
 └── GET /medicines/barcode/:barcode

Prescription
 ├── POST /me/prescriptions
 ├── POST /me/prescriptions/scan
 ├── GET /me/prescriptions/:id
 └── PATCH /me/prescriptions/:id

Treatment
 ├── GET /me/treatments
 ├── GET /me/treatments/:id
 └── POST /me/medication-events

Sharing
 ├── POST /me/shares
 ├── POST /shares/redeem
 ├── GET /me/shares/active
 ├── DELETE /me/shares/:id
 ├── GET /me/shares/audit
 ├── GET /me/access-grants
 ├── DELETE /me/access-grants/:grantId
 └── GET /shared/access-grants

AI
 └── POST /ai/ask
```

------------------------------------------------------------------------

# 43. Screen Implementation Rule

Do not implement all screens as isolated mockups.

Build vertical slices:

``` text
Slice 1
Login → Home → My Pharmacy → Add Medicine

Slice 2
Scan → Identify → Confirm → Inventory

Slice 3
Prescription → OCR → Review → Treatment

Slice 4
Treatment → Reminder → Event → Progress

Slice 5
AI → Typed tools → Contextual answers

Slice 6
Share → Permissions → Code → Redeem → Revoke
```

Each slice must work end-to-end before moving to the next.

------------------------------------------------------------------------

# 44. Definition of Done for a Screen

A screen is not complete until:

-   UI implemented
-   API integrated
-   loading implemented
-   empty implemented
-   error implemented
-   validation implemented
-   authorization behavior verified
-   navigation verified
-   accessibility checked
-   RTL checked
-   dark mode checked
-   analytics/event instrumentation defined where appropriate
-   automated tests added for critical behavior

# 45. Approved foundation screen contracts

- Navigation uses Expo Router; TanStack Query handles API server state. Shared
  Zod validation improves input feedback; the NestJS API remains authoritative.
- Splash loads the authenticated patient through GET /api/v1/me/profile. Login
  refreshes via rotating secure-storage credentials and a revocable Session.
  Recovery is deferred, not a working placeholder. Professional profile contracts
  remain a separate later decision; the patient profile endpoint is not reused blindly.
- Add/Edit Inventory requires explicit quantity AND unit. Use controlled codes
  such as CAPSULE, displayed as localized “capsules”. Structured catalog data may
  suggest a unit for confirmation; never infer it from AI or free-text strength.
  Include optional lowStockThreshold in that unit when notification settings ship.
- Remove from My Pharmacy confirms archive, not permanent deletion. The row leaves
  active lists and calculations while historical/audit references remain.
- Prescription review displays ordered pages and per-field value, confidence,
  source and confirmation. Edits create revisions, preserving original extraction.
  Unknown prescribed quantity remains blank/null; zero is invalid. Only confirmed
  retained fields become business CONFIRMED; treatment activation is a separate action.
- Treatment V1 offers FIXED_TIMES only. Show the schedule timezone captured from
  the profile. INTERVAL and AS_NEEDED are deferred, not selectable options.
  Obtain occurrenceId from treatment detail and send it when recording a dose.
- Share setup supports Doctor and Pharmacy only. Caregiver/Family are future-only.
  Show independent permissions and explicitly confirm grant expiry or no scheduled
  expiry. READ_INVENTORY does not include expiry/batch; READ_TREATMENTS does not
  include event history/progress. READ_PRESCRIPTIONS includes confirmed documents.
- Recipient redemption yields grantId. Doctor/Pharmacy dashboards list
  GET /api/v1/shared/access-grants; navigate through /shared/:grantId resources.
  No hidden-UI control substitutes for grant authorization. Display only the
  active grant's permitted categories/fields, including in nested detail screens.
- Notification settings use GET/PATCH /api/v1/me/notification-preferences.
  Unconfigured settings are shown as unconfigured, not fabricated defaults.
  First save explicitly supplies all five categories. Push provider is undecided.
- Community availability/request screens remain future-only and absent from V1 navigation.
