# Saydaliyati --- DESIGN-SYSTEM.md

Version: 1.0 Status: UI implementation baseline

------------------------------------------------------------------------

# 1. Design Direction

Saydaliyati should feel like:

-   Apple Health
-   premium fintech
-   modern pharmacy
-   calm and trustworthy
-   simple enough for everyday use
-   sophisticated without looking clinical

Avoid:

-   generic hospital-blue interfaces
-   excessive gradients
-   red-cross medical clichés
-   literal capsule logos
-   mortar-and-pestle clichés
-   dense enterprise dashboards
-   excessive glassmorphism
-   excessive rounded "bubble" UI
-   decorative animation that competes with medication information

The interface should communicate:

> Calm control over something important.

------------------------------------------------------------------------

# 2. Brand

## Name

English/French:

``` text
Saydaliyati
```

Arabic:

``` text
صيدليتي
```

Meaning:

``` text
My Pharmacy
```

## Tagline

EN:

``` text
All my medicines, in one place.
```

FR:

``` text
Tous mes médicaments, au même endroit.
```

AR:

``` text
كل أدويتي في مكان واحد
```

------------------------------------------------------------------------

# 3. Design Principles

## 3.1 Trust first

Medication information is sensitive.

The interface must feel deliberate and predictable.

## 3.2 One important action

Each screen should have a visually obvious primary action.

## 3.3 Information hierarchy

Prioritize:

``` text
What is it?
What do I need to do?
When?
How much?
What needs attention?
```

## 3.4 Progressive disclosure

Do not expose technical details until needed.

## 3.5 Confirm uncertainty

AI/OCR/scanning results are candidates until confirmed.

## 3.6 Calm alerts

Expiry and low-stock alerts should be useful, not alarming.

------------------------------------------------------------------------

# 4. Color Tokens

These are initial tokens and must be accessibility-tested.

``` text
Primary       #087F7B
Primary Dark  #05615E
Primary Soft  #DDF4F1

Background    #F8FAF9
Surface       #FFFFFF

Text Primary  #172321
Text Secondary#667371
Text Muted    #879390

Border        #E4EAE8

Success       #2E8B57
Warning       #D99A24
Danger        #D9534F
Info          #4C7DCC
```

Do not hard-code colors throughout the application.

Use semantic tokens.

------------------------------------------------------------------------

# 5. Semantic Color Roles

Instead of:

``` text
green
red
blue
```

use:

``` text
colorPrimary
colorSurface
colorTextPrimary
colorTextSecondary
colorBorder
colorSuccess
colorWarning
colorDanger
colorInfo
```

Components must consume semantic roles.

------------------------------------------------------------------------

# 6. Dark Mode

Dark mode must be designed independently.

Do not simply invert colors.

Example token structure:

``` text
light.background
dark.background

light.surface
dark.surface

light.text.primary
dark.text.primary
```

Maintain readable contrast and distinguish surfaces through
elevation/border rather than bright colors.

------------------------------------------------------------------------

# 7. Typography

## Latin

Primary:

``` text
Inter
```

Fallback:

``` text
system sans-serif
```

## Arabic

Primary:

``` text
Noto Sans Arabic
```

Fallback:

``` text
system Arabic sans-serif
```

------------------------------------------------------------------------

# 8. Type Scale

``` text
Display       32 px / 40
Heading 1     28 px / 36
Heading 2     22 px / 30
Heading 3     18 px / 26
Body Large    17 px / 25
Body          16 px / 24
Body Small    14 px / 20
Caption       12 px / 18
```

Font weight:

``` text
Regular       400
Medium        500
Semibold      600
Bold          700
```

Avoid excessive bold text.

------------------------------------------------------------------------

# 9. Spacing

Use a consistent base scale.

``` text
4
8
12
16
20
24
32
40
48
64
```

Primary screen horizontal padding:

``` text
16–20 px
```

Card internal padding:

``` text
16 px
```

Large section spacing:

``` text
24–32 px
```

------------------------------------------------------------------------

# 10. Border Radius

Use moderate rounding.

``` text
Small       8 px
Input       12 px
Card        16 px
Large Card  20 px
Pill        999 px
```

Avoid using pills for everything.

------------------------------------------------------------------------

# 11. Elevation

Prefer subtle borders and restrained shadows.

Levels:

``` text
none
small
medium
modal
```

Cards should not look like floating plastic tiles.

------------------------------------------------------------------------

# 12. Buttons

## Primary

Used for the main action.

Example:

``` text
Confirm medicine
Create treatment
Generate code
```

## Secondary

Used for important but non-primary actions.

## Tertiary

Text/button action.

## Destructive

Used only for destructive operations.

Example:

``` text
Revoke access
Delete medicine
```

Destructive actions require confirmation.

------------------------------------------------------------------------

# 13. Button Dimensions

Minimum:

``` text
Height: 48 px
Horizontal padding: 16–20 px
```

Touch target:

``` text
≥44 × 44 px
```

Loading state:

``` text
label → progress indicator
```

Do not allow repeated submissions during mutation.

------------------------------------------------------------------------

# 14. Inputs

Inputs should have:

``` text
label
field
helper/error text
```

Do not rely on placeholders as labels.

States:

``` text
default
focused
filled
disabled
error
success
```

------------------------------------------------------------------------

# 15. Search

Search should feel fast and lightweight.

Example:

``` text
⌕ Search medicines
```

Support:

-   medicine names
-   active ingredients
-   brand
-   barcode
-   Arabic
-   French
-   transliteration

Search result cards should be compact.

------------------------------------------------------------------------

# 16. Cards

Cards are used to group related information.

Avoid nesting many cards inside cards.

## Medicine Card

``` text
[package image]

Medicine name
Strength

Quantity
Expiry
Status
```

## Treatment Card

``` text
Treatment name
Day X / Y

Progress
Next dose
```

## Prescription Card

``` text
Prescription
Date
Medicine count
Status
```

------------------------------------------------------------------------

# 17. Medicine Images

Medicine packaging is highly useful for recognition.

Preferred:

-   real package images
-   consistent crop
-   neutral background
-   high enough resolution
-   no unnecessary decorative treatment

Image fallback:

``` text
generic medicine illustration
```

Never distort package proportions.

------------------------------------------------------------------------

# 18. Status Badges

Semantic statuses:

``` text
Success
Warning
Danger
Info
Neutral
```

Examples:

``` text
Active
Expiring soon
Low stock
Completed
Pending
Expired
```

Never communicate status by color alone.

Include text/icon.

------------------------------------------------------------------------

# 19. Quantity Display

Prefer human-readable language.

Good:

``` text
24 capsules
```

Avoid:

``` text
qty: 24
```

Inventory records always store quantity and an explicit controlled inventory_unit.
Display localized/pluralized labels (CAPSULE → “capsules”); never display a bare
quantity. Structured medicine/package data may suggest a unit for user confirmation,
but AI and free-text strength must never infer it. Complex conversion is deferred.

------------------------------------------------------------------------

# 20. Expiry Display

Normal:

``` text
Expires May 2027
```

Soon:

``` text
Expires in 18 days
```

Expired:

``` text
Expired
```

Use exact date in detail view.

Do not use ambiguous formats.

------------------------------------------------------------------------

# 21. Treatment Progress

Use a progress bar plus text.

Example:

``` text
Day 4 of 7
██████░░
```

Always provide a textual representation for accessibility.

------------------------------------------------------------------------

# 22. Dose Timeline

Example:

``` text
08:00   ✓ Taken
14:00   ✓ Taken
20:00   ○ Upcoming
```

Do not use color alone to distinguish states.

------------------------------------------------------------------------

# 23. Scanner UI

Scanner should feel focused.

Components:

``` text
camera
scan frame
instruction
flash
gallery
manual search
```

Instruction:

``` text
Position the barcode inside the frame
```

When found:

``` text
Barcode detected
```

Avoid unnecessary visual effects.

------------------------------------------------------------------------

# 24. Scan Confirmation

The confirmation screen should make uncertainty explicit.

High confidence:

``` text
We found this medicine
```

Lower confidence:

``` text
Possible match
```

Never:

``` text
Definitely this medicine
```

unless exact structured identification exists.

------------------------------------------------------------------------

# 25. Prescription UI

Prescription review is safety-sensitive.

Visual hierarchy:

``` text
original document
        ↓
extracted fields
        ↓
confidence / review
        ↓
confirmation
```

Uncertain fields should have visible review affordances.

------------------------------------------------------------------------

# 26. AI UI

Brand AI as:

``` text
Ask Saydaliyati
```

not:

``` text
ChatGPT
AI Doctor
Medical AI
```

The product should feel like a medication assistant.

## AI message

Use concise responses.

Prefer:

``` text
Answer
Why
Relevant medicine/treatment
Optional next action
```

Avoid walls of text.

------------------------------------------------------------------------

# 27. AI Context

Contextual AI entry points should visually indicate context.

Example:

``` text
Ask Saydaliyati about this medicine
```

rather than opening a generic conversation with no context.

------------------------------------------------------------------------

# 28. Sharing UI

Sharing should feel secure but understandable.

## Code

``` text
7K4P9X
```

Use large monospaced typography.

## Expiry

``` text
Expires in 09:42
```

## Permissions

Use explicit labels:

``` text
Medicines
Inventory
Prescriptions
Treatments
History
```

Avoid technical permission names.

------------------------------------------------------------------------

# 29. QR UI

QR code should have:

-   sufficient quiet zone
-   high contrast
-   error correction
-   clear surrounding instructions

Text:

``` text
Let the recipient scan this code
```

Never encode patient data directly.

------------------------------------------------------------------------

# 30. Navigation

Bottom navigation:

``` text
Home
My Pharmacy
Scan
Treatments
More
```

Use icons plus labels.

Do not rely on icon-only navigation for primary destinations.

------------------------------------------------------------------------

# 31. Icons

Use one consistent icon family.

Recommended:

``` text
Lucide-style outline icons
```

Avoid mixing icon styles.

Icons should reinforce meaning, not replace text for unfamiliar
concepts.

------------------------------------------------------------------------

# 32. Icon Sizes

Typical:

``` text
16 px — inline
20 px — standard
24 px — navigation/action
32 px — prominent action
```

------------------------------------------------------------------------

# 33. Illustration Style

Illustrations should be:

-   minimal
-   geometric
-   warm
-   modern
-   medically neutral

Avoid overly childish illustrations.

------------------------------------------------------------------------

# 34. Empty States

Every major collection needs a useful empty state.

Structure:

``` text
Illustration/icon

Short explanation

Primary action

Optional secondary action
```

Example:

``` text
Your pharmacy is empty.

Add your first medicine by scanning its package.

[Scan medicine]
```

------------------------------------------------------------------------

# 35. Error States

Use calm language.

Example:

``` text
We couldn't load your medicines.

Please try again.

[Retry]
```

Never expose:

-   stack traces
-   SQL errors
-   internal provider names
-   request IDs to ordinary users

------------------------------------------------------------------------

# 36. Confirmation Sheets

Use bottom sheets for lightweight confirmations.

Use full-screen confirmation only for complex/safety-sensitive review.

Examples:

``` text
Remove this medicine?
Revoke access?
```

------------------------------------------------------------------------

# 37. Modal Rules

Avoid modal overload.

Use:

``` text
bottom sheet
dialog
full-screen flow
```

according to complexity.

Prescription review and treatment creation should generally be
full-screen flows.

------------------------------------------------------------------------

# 38. Toasts / Snackbars

Use only for lightweight feedback.

Examples:

``` text
Medicine added
Dose recorded
Copied
```

Do not use transient feedback for critical information.

------------------------------------------------------------------------

# 39. Motion

Default duration:

``` text
150–300 ms
```

Use motion for:

-   navigation
-   state changes
-   confirmation
-   progress
-   list insertion

Avoid:

-   constant bouncing
-   excessive parallax
-   distracting animations

Support reduced motion.

------------------------------------------------------------------------

# 40. Haptics

Optional subtle haptic feedback for:

-   successful scan
-   dose confirmation
-   important confirmation

Never use aggressive haptics for medical alerts.

------------------------------------------------------------------------

# 41. Accessibility

Minimum:

-   screen reader labels
-   dynamic type
-   minimum touch target
-   sufficient contrast
-   reduced motion
-   keyboard accessibility where relevant
-   focus management
-   no color-only meaning

------------------------------------------------------------------------

# 42. RTL

Arabic is first-class.

Use logical layout directions.

Do not hard-code:

``` text
left
right
```

when the meaning is:

``` text
start
end
```

Medicine names and Latin characters may require directional isolation.

------------------------------------------------------------------------

# 43. Localization

Never concatenate translated fragments.

Bad:

``` text
"Day " + day + " of " + total
```

Use localization messages with variables.

Example concept:

``` text
treatment.progress(day, total)
```

Pluralization must be supported.

------------------------------------------------------------------------

# 44. Date and Time

Use locale-aware formatting.

Treatment schedules must respect the user's configured timezone.

Store backend timestamps as UTC.

Render locally.

------------------------------------------------------------------------

# 45. Arabic Numerals

Do not assume one numeral presentation is correct for every context.

Preserve machine-readable values while allowing localized display.

Barcode values should remain machine-readable and should not be
localized in a way that prevents scanning/copying.

------------------------------------------------------------------------

# 46. Responsive Layout

Primary target:

``` text
mobile portrait
```

Support:

``` text
small phones
large phones
tablet
```

Use responsive constraints rather than fixed coordinates.

------------------------------------------------------------------------

# 47. Component Architecture

Suggested React Native structure:

``` text
src/
├── components/
│   ├── ui/
│   ├── medicine/
│   ├── treatment/
│   ├── prescription/
│   ├── sharing/
│   └── ai/
├── screens/
├── navigation/     # Expo Router helpers; route files follow Expo Router conventions
├── hooks/
├── theme/
├── i18n/
└── services/
```

UI primitives should be reusable.

Domain components should encode product semantics.

------------------------------------------------------------------------

# 48. Theme API

Expose semantic tokens to components.

Conceptual structure:

``` ts
theme.colors.primary
theme.colors.surface
theme.colors.text.primary
theme.colors.text.secondary
theme.colors.border
theme.colors.success
theme.colors.warning
theme.colors.danger
theme.colors.info

theme.spacing[4]
theme.spacing[8]
theme.spacing[16]

theme.radius.card
theme.radius.input

theme.typography.body
theme.typography.heading1
```

Do not distribute raw hex values across screens.

------------------------------------------------------------------------

# 49. Component States

Reusable components should support states explicitly.

Example:

``` text
MedicineCard
 ├── default
 ├── loading
 ├── unavailable image
 ├── expiring
 ├── expired
 └── low stock
```

------------------------------------------------------------------------

# 50. Design QA

Before declaring a screen complete:

``` text
Light mode       ✓
Dark mode        ✓
English          ✓
French           ✓
Arabic RTL       ✓
Small screen     ✓
Large screen     ✓
Large text       ✓
Loading          ✓
Empty            ✓
Error            ✓
Offline          ✓
Accessibility    ✓
```

------------------------------------------------------------------------

# 51. Visual Regression

Critical screens should eventually have visual regression coverage.

Priority:

1.  Home
2.  My Pharmacy
3.  Medicine detail
4.  Scanner
5.  Prescription review
6.  Treatment
7.  Sharing
8.  AI

------------------------------------------------------------------------

# 52. Design-to-Code Rule

The design system is the source for visual primitives.

The screen specification is the source for screen behavior.

The API contract is the source for network behavior.

The database specification is the source for persistence.

When a visual requirement conflicts with a safety or authorization
requirement, safety/authorization wins.

------------------------------------------------------------------------

# 53. Initial Component Inventory

The first reusable component library should contain:

``` text
AppButton
AppIconButton
AppText
AppInput
AppSearchBar
AppCard
AppBadge
AppDivider
AppAvatar
AppModal
AppBottomSheet
AppSnackbar
AppSkeleton
AppEmptyState
AppErrorState

MedicineCard
MedicineImage
MedicineStatus
QuantityControl
ExpiryBadge

TreatmentCard
TreatmentProgress
DoseTimeline
DoseEvent

PrescriptionCard
PrescriptionReviewField
ConfidenceIndicator

SharePermissionList
ShareCode
QrCodeView

AiPromptCard
AiMessage
AiComposer
```

------------------------------------------------------------------------

# 54. Build Priority

Implement design primitives in this order:

``` text
1. Theme
2. Typography
3. Spacing
4. Buttons
5. Inputs
6. Cards
7. Status
8. Navigation
9. Medicine components
10. Treatment components
11. Prescription components
12. Sharing components
13. AI components
```

Do not create dozens of components before the core tokens are stable.

------------------------------------------------------------------------

# 55. Definition of Done

The design system is ready for production UI work when:

-   tokens exist in code
-   light/dark themes exist
-   Arabic RTL works
-   typography is loaded
-   reusable primitives exist
-   semantic colors are used
-   accessibility baseline exists
-   core domain components exist
-   screen specs can be implemented without inventing visual rules

## 56. Foundation-specific display rules

Distinguish the code countdown from access-grant lifetime. Show “Until revoked”
only when the patient explicitly chose no scheduled grant expiry. Separate Cancel
code and Revoke access actions. Only Doctor/Pharmacy are selectable in V1;
Caregiver/Family and community visuals are future references.

Hide expiry/batch and medication-event history when the grant lacks those scopes,
even inside other cards. No visual reference can override these privacy projections.
Use explicit unit selection, archive-removal wording, field-level OCR confidence
and confirmation, and fixed-time schedule timezone labels. Notification preferences
show an unconfigured state until settings exist; do not invent default opt-ins.
