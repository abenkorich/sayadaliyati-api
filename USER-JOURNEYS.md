# Saydaliyati --- USER-JOURNEYS.md

Version: 1.0\
Status: UX implementation baseline

------------------------------------------------------------------------

# 1. Purpose

This document defines how users move through Saydaliyati.

The objective is to make the complex medication-management platform feel
simple.

Core principle:

> The user should think in terms of medicines, treatments and people ---
> not database entities.

------------------------------------------------------------------------

# 2. Primary Information Architecture

The patient-facing application has five primary areas:

``` text
Home
My Pharmacy
Scan
Treatments
More
```

Sharing is a prominent action but does not need to become a permanent
fifth data-heavy tab if it is surfaced from Home and contextual screens.

Recommended bottom navigation:

``` text
Home     My Pharmacy     Scan     Treatments     More
```

The Scan action is visually prominent.

------------------------------------------------------------------------

# 3. Journey A --- First Launch

## Goal

Get the user to a useful first action quickly.

``` text
Install
 ↓
Splash
 ↓
Onboarding
 ↓
Create account / Sign in
 ↓
Home
 ↓
Scan medicine OR Add manually
```

## Onboarding messages

### Screen 1

**Your medicines, organized.**

Keep your medicines, prescriptions and treatments together.

### Screen 2

**Never lose track of a dose.**

Get reminders and see your treatment progress.

### Screen 3

**Know what you have.**

Track quantity, expiry and medicine details.

### Screen 4

**Share when you choose.**

Securely share selected information with your doctor or pharmacy.

## Acceptance

The user should understand the product within seconds.

Avoid a long feature tour.

------------------------------------------------------------------------

# 4. Journey B --- Create Account

``` text
Create account
 ↓
Name
 ↓
Email/phone
 ↓
Password
 ↓
Language
 ↓
Timezone
 ↓
Verification if required
 ↓
Home
```

## UX rule

Do not ask for unnecessary medical information during registration.

Collect additional information progressively.

------------------------------------------------------------------------

# 5. Journey C --- Home

Home is the user's command center.

## Example

``` text
Good evening, Imane 👋

My Pharmacy
17 medicines
2 expiring soon

Current treatment
Amoxicilline 500 mg
Day 4 of 7

Next dose
20:00
[Mark as taken]

Quick actions
[Scan medicine]
[Add prescription]

Ask Saydaliyati
"What do you want to know?"
```

## Home priorities

1.  immediate medication action
2.  treatment progress
3.  important alerts
4.  quick actions
5.  AI assistance

Do not turn Home into a dense analytics dashboard.

------------------------------------------------------------------------

# 6. Journey D --- Add Medicine by Barcode

## Goal

Add a physical medicine package to My Pharmacy.

``` text
Home
 ↓
Scan
 ↓
Camera
 ↓
Barcode detected
 ↓
Medicine found
 ↓
Medicine confirmation
 ↓
Inventory details
 ↓
Save
 ↓
My Pharmacy
```

## Step 1 --- Camera

Show:

-   camera preview
-   scanning frame
-   flashlight
-   manual search fallback

## Step 2 --- Barcode

If exact match:

``` text
Medicine found
Amoxicilline 500 mg
Example manufacturer
```

## Step 3 --- Confirmation

User confirms the identified medicine.

Never automatically add it solely from a scan.

## Step 4 --- Inventory

Ask:

-   quantity
-   unit
-   expiry
-   batch
-   optional storage location

Minimize typing.

## Success

``` text
Added to My Pharmacy ✓
```

------------------------------------------------------------------------

# 7. Journey E --- Medicine Recognition by Image

When barcode lookup fails:

``` text
Camera
 ↓
Image capture
 ↓
OCR / Vision
 ↓
Candidate medicines
 ↓
Confidence
 ↓
User confirmation
 ↓
Inventory
```

## UX

If confidence is high:

> We think this is Amoxicilline 500 mg.

If confidence is low:

> We couldn't confidently identify this medicine. Choose a match or
> search manually.

Never present uncertain recognition as fact.

------------------------------------------------------------------------

# 8. Journey F --- My Pharmacy

## Goal

Understand everything currently available to the patient.

``` text
My Pharmacy
 ↓
Search/filter
 ↓
Medicine card
 ↓
Medicine detail
```

## Medicine card

``` text
[package]
Amoxicilline
500 mg

24 capsules
Expires May 2027
```

## Filters

-   All
-   Expiring soon
-   Low stock
-   Recently added

## Empty state

``` text
Your pharmacy is empty.

Scan a medicine package to add your first medicine.

[Scan medicine]
```

------------------------------------------------------------------------

# 9. Journey G --- Medicine Detail

``` text
My Pharmacy
 ↓
Medicine
 ↓
Medicine detail
```

Display:

-   package image
-   name
-   strength
-   form
-   active ingredients
-   quantity
-   expiry
-   batch
-   manufacturer
-   structured information

Actions:

``` text
Edit inventory
Ask Saydaliyati
Remove from My Pharmacy
```

AI should be contextual:

> Ask Saydaliyati about this medicine

------------------------------------------------------------------------

# 10. Journey H --- Add Prescription

## Goal

Turn a prescription document into structured medication data.

``` text
Home
 ↓
Add prescription
 ↓
Take photo / Upload
 ↓
Processing
 ↓
Prescription review
 ↓
Confirm
 ↓
Prescription saved
```

------------------------------------------------------------------------

# 11. Journey I --- Prescription Review

This is a critical safety screen.

## Layout

``` text
Original prescription
        +
Extracted medications
```

Each medication is a separate review card.

Example:

``` text
Amoxicilline
500 mg
3 times/day
7 days

Confidence: High

[Confirm]
[Edit]
[Reject]
```

## Low-confidence field

Highlight:

``` text
⚠ Frequency
3 times/day?
[Confirm] [Edit]
```

Never silently convert uncertain OCR into an active treatment.

------------------------------------------------------------------------

# 12. Journey J --- Prescription → Treatment

After prescription confirmation:

``` text
Prescription
 ↓
Create treatment
 ↓
Review medicines
 ↓
Set start date
 ↓
Review schedules
 ↓
Confirm
 ↓
Treatment active
```

## Important

Do not automatically activate a treatment merely because OCR found a
prescription.

User confirmation is required.

------------------------------------------------------------------------

# 13. Journey K --- Treatment Setup

Example:

``` text
Amoxicilline 500 mg

Dose
500 mg

Frequency
3 times a day

Start
12 Sep

End
18 Sep

Suggested times
08:00
14:00
20:00

[Confirm treatment]
```

Allow editing of schedule details while making clear that the app is
recording the user's treatment instructions, not independently
prescribing them.

------------------------------------------------------------------------

# 14. Journey L --- Daily Treatment

Home:

``` text
Current treatment
Amoxicilline 500 mg

Day 4 / 7

08:00 ✓
14:00 ✓
20:00 ○

Next dose
20:00

[Mark as taken]
```

After taking:

``` text
20:00 ✓
```

The medication event is recorded.

Treatment progress updates.

------------------------------------------------------------------------

# 15. Journey M --- Missed Dose

If the scheduled time passes:

``` text
20:00 dose
May have been missed
```

Do not automatically tell the user to double the next dose or change
timing.

Offer:

``` text
View treatment instructions
Contact healthcare professional
```

The exact medical guidance should come from approved clinical content if
introduced later.

------------------------------------------------------------------------

# 16. Journey N --- Inventory vs Treatment

User asks:

> Do I have enough medicine for my treatment?

Flow:

``` text
AI
 ↓
getActiveTreatment
 ↓
calculate required doses
 ↓
getInventory
 ↓
calculate available stock
 ↓
Explain result
```

Example:

> You have approximately 18 capsules. Your current treatment requires
> 21. You may need 3 more capsules.

This is a calculation, not a medical prescription. It is valid only when
regimen and inventory units are explicitly compatible. Otherwise explain that
structured information is insufficient; never infer conversion from strength or AI.

------------------------------------------------------------------------

# 17. Journey O --- Expiry

Home:

``` text
2 medicines expiring soon
```

Tap:

``` text
Expiring soon
 ↓
Inventory filtered by expiry
 ↓
Medicine detail
```

Show exact dates.

Do not use alarming language for ordinary expiry reminders.

------------------------------------------------------------------------

# 18. Journey P --- Ask Saydaliyati

## Global entry

``` text
Home
 ↓
Ask Saydaliyati
```

## Contextual entry

``` text
Medicine detail
 ↓
Ask Saydaliyati about this medicine
```

or:

``` text
Treatment
 ↓
Ask Saydaliyati
```

## Suggested questions

### Home

-   What expires soon?
-   Do I have enough medicine?
-   What is my next dose?

### Medicine

-   What is this medicine?
-   What is the active ingredient?
-   Which medicines do I have with the same ingredient?

### Prescription

-   Explain this prescription.
-   What does each medicine do?

### Treatment

-   How many doses remain?
-   How many days are left?

------------------------------------------------------------------------

# 19. Journey Q --- Share With Doctor

``` text
Home
 ↓
Share
 ↓
Doctor
 ↓
Choose permissions
 ↓
Generate code
 ↓
7K4P9X
 ↓
Show QR
 ↓
Doctor authenticates and redeems
 ↓
AccessGrant created
 ↓
Patient data available within grant scope
```

## Permission examples

``` text
☑ Medicines
☑ Inventory
☑ Prescriptions
☐ Treatments
☐ History
```

The user should understand exactly what is being shared.

------------------------------------------------------------------------

# 20. Journey R --- Share With Pharmacy

Same fundamental flow:

``` text
Share
 ↓
Pharmacy
 ↓
Permissions
 ↓
Code
 ↓
QR
 ↓
Pharmacy redeems
```

Initially, pharmacy access should focus on information necessary for the
intended workflow.

Do not expose the entire medical history by default.

------------------------------------------------------------------------

# 21. Journey S --- Revoke Access

``` text
More
 ↓
Sharing & access
 ↓
Select person
 ↓
Access details
 ↓
Revoke
 ↓
Confirmation
 ↓
Access immediately invalid
```

Example:

``` text
Dr. Example
Can access:
Medicines
Prescriptions

[Revoke access]
```

Revoke the AccessGrant, not the bootstrap code. Subsequent shared API calls fail.
Cancelling or expiring a code does not revoke already-created grants.

------------------------------------------------------------------------

# 22. Journey T --- Doctor

Doctor login:

``` text
Sign in
 ↓
Doctor dashboard
 ↓
Patients
 ↓
Patient
 ↓
Medication overview
 ↓
Prescriptions / Treatments
```

Doctor sees only patients represented by active, recipient-bound AccessGrants.
A connection record alone never authorizes access.

------------------------------------------------------------------------

# 23. Journey U --- Pharmacy

Pharmacy login:

``` text
Sign in
 ↓
Pharmacy dashboard
 ↓
Shared patients
 ↓
Patient medication information
```

Future:

``` text
Pharmacy
 ↓
Inventory
 ↓
Availability
 ↓
Patient requests
```

------------------------------------------------------------------------

# 24. Journey V --- Community Medicine Request

Future feature.

``` text
Search medicine
 ↓
Not available in My Pharmacy / need medicine
 ↓
Find availability
 ↓
Create request
 ↓
Select city/wilaya
 ↓
Publish
 ↓
Pharmacies/community respond
```

Initial implementation should focus on availability signals.

Do not build peer-to-peer medicine transfer/sale without dedicated legal
and safety review.

------------------------------------------------------------------------

# 25. Journey W --- Caregiver

Future:

``` text
Patient/Dependent
 ↓
Share
 ↓
Caregiver
 ↓
Permissions
 ↓
Connection
```

Caregiver permissions should be narrower than unrestricted account
access.

------------------------------------------------------------------------

# 26. Journey X --- Search

Search should work across:

``` text
Medicine name
Brand
Generic name
Active ingredient
Barcode
```

For Arabic:

``` text
Arabic spelling
Latin transliteration
French names
```

Example:

``` text
paracetamol
باراسيتامول
paracétamol
```

Search relevance should prioritize exact/strong medicine matches.

------------------------------------------------------------------------

# 27. Journey Y --- Error Handling

Every major journey has three classes of failure.

## Recoverable

``` text
Try again
Retry
Search manually
```

## User correction

``` text
Edit
Confirm
Choose another medicine
```

## System failure

``` text
We couldn't complete this right now.
Your existing data is safe.
Try again later.
```

Never show raw API/database errors.

------------------------------------------------------------------------

# 28. Journey Z --- Offline / Poor Connectivity

The mobile app should degrade gracefully.

Possible offline features:

-   viewing recently cached medicines/inventory
-   viewing today's treatment schedule
-   recording dose events locally for later sync where safe

Sensitive synchronization conflicts require explicit conflict
resolution.

Do not silently overwrite newer server data.

------------------------------------------------------------------------

# 29. Global Navigation Rules

From almost every relevant screen:

``` text
Back
Home
Scan
```

should remain easy to reach.

The Scan action is a central product action.

------------------------------------------------------------------------

# 30. UX State Matrix

Every data-driven screen must support:

``` text
Loading
 ↓
Success
 ↓
Empty
 ↓
Error
 ↓
Retry
```

For network-dependent actions:

``` text
Online
Offline
Reconnecting
Synced
Pending sync
Conflict
```

Only expose states that the implementation actually supports.

------------------------------------------------------------------------

# 31. Safety-Critical Confirmation Points

User confirmation is mandatory for:

1.  medicine recognition before inventory creation
2.  OCR prescription medication extraction
3.  uncertain dosage/frequency/duration
4.  creation/activation of treatment
5.  sharing health data
6.  revoking professional access
7.  destructive inventory/prescription actions where applicable

------------------------------------------------------------------------

# 32. UX Acceptance Criteria

A patient should be able to answer these questions immediately:

``` text
What medicines do I have?
What should I take next?
How much do I have left?
What is expiring?
What does this medicine contain?
What did my prescription say?
Who can access my data?
```

If a user needs to navigate through multiple administrative screens to
answer these questions, the UX should be reconsidered.

------------------------------------------------------------------------

# 33. Core Product Loop

The fundamental Saydaliyati loop is:

``` text
SCAN
 ↓
CONFIRM
 ↓
STORE
 ↓
TRACK
 ↓
REMIND
 ↓
UNDERSTAND
 ↓
SHARE
```

This loop should remain visible in product decisions.

------------------------------------------------------------------------

# 34. Design-to-Engineering Rule

UX documents describe behavior.

Design-system documents describe visual implementation.

API documents describe data contracts.

Database documents describe persistence.

No one document should silently redefine another.

When behavior changes:

``` text
UX
 + API
 + database
 + tests
```

must be reviewed together.

# 35. Foundation journey clarifications

Registration/login creates a revocable server Session with rotating refresh
tokens stored only in mobile secure storage. GET /me/profile provides the patient
profile; PATCH edits name/language/timezone without changing existing schedules.
Password recovery is explicitly deferred until a contract is approved.

Add Medicine always captures quantity AND a controlled unit (e.g. 24 CAPSULE,
displayed as “24 capsules”). A catalog suggestion is confirmed, not inferred
from AI or free-text strength. Remove from My Pharmacy archives after confirmation;
it does not delete clinical/audit history.

Prescription capture accepts ordered pages. Review tracks per-field value,
confidence, source and confirmation, preserving revisions. Prescribed quantity
is positive or unknown/null, never zero. OCR processing completion and prescription
business confirmation are separate from treatment activation.

Treatments initially use FIXED_TIMES and the captured patient timezone. Each
expected dose has a stable server-issued occurrenceId. A retry records the same
event, never a second dose. INTERVAL/AS_NEEDED and complex conversion are deferred.

Sharing supports DOCTOR/PHARMACY only. Choose independent permissions, explicitly
approve grant lifetime, create short-lived ShareSession, authenticate recipient,
redeem into AccessGrant, then access scoped data. Code countdown and grant expiry
are distinct. Active-access lists show grants; pending-code lists show sessions.
Cancel code prevents redemption; Revoke access terminates the grant. Caregiver,
Family and community flows remain future-only.

Notification settings persist explicit preferences for dose, expiry, low-stock,
sharing and system categories. Unconfigured settings are not consent. Thresholds,
provider and missed-dose/DST policies remain pre-feature decisions where unresolved.
