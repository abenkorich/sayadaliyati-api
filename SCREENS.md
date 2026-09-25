# Screen Inventory and User Flows

## 1. Core screens

1.  Splash
2.  Onboarding
3.  Create account
4.  Sign in
5.  Home
6.  My Pharmacy
7.  Medicine detail
8.  Scan medicine
9.  Scan result / confirmation
10. Add prescription
11. Prescription review
12. Prescription detail
13. Treatment detail
14. Treatment schedule
15. AI assistant
16. Share setup
17. Share code
18. Shared patient view
19. Doctor patient overview
20. Pharmacy patient overview
21. Community medication request (future; not V1)
22. Profile
23. Settings
24. Notifications
25. Security
26. Language
27. Appearance
28. Dark mode
29. Arabic RTL home

## 2. Onboarding

Goal: explain the value in seconds.

Messages:

-   Keep your medicines organized
-   Track treatments and doses
-   Know what is expiring
-   Share safely with professionals

Do not overload onboarding with feature explanations.

## 3. Home

Example:

``` text
Good evening, Imane 👋

My pharmacy       17 medicines
Expiring soon       2
Active treatments   3

Current treatment
Amoxicilline 500 mg
Day 4 of 7
Next dose 20:00
[Mark as taken]

[Scan medicine]
[Add prescription]
[My doctors]
[Sharing]

Ask Saydaliyati
```

## 4. My Pharmacy

Features:

-   search
-   filters
-   categories/status
-   inventory cards
-   expiry sorting
-   low stock

## 5. Scan medicine

Flow:

``` text
camera
 ↓
barcode detection
 ↓
candidate match
 ↓
visual/OCR verification
 ↓
review
 ↓
add to My Pharmacy
```

## 6. Prescription

Flow:

``` text
scan/upload
 ↓
OCR
 ↓
structured extraction
 ↓
review each medicine
 ↓
confirm
 ↓
save prescription
 ↓
create treatment
```

## 7. Treatment

Show progress:

`Day 4 / 7`

Dose rows:

-   08:00 ✓
-   14:00 ✓
-   20:00 ○

## 8. AI

Suggested prompts:

-   What do I have that expires soon?
-   Explain my prescription
-   Do I have enough medicine for my treatment?
-   What medicines do I have containing paracetamol?

## 9. Sharing

Patient chooses:

-   Doctor
-   Pharmacy
-   Caregiver/Family (future; not a selectable V1 option)

Then permissions and code.

## 10. Professional views

Professional screens should use the same design system but prioritize:

-   patient identity
-   medications
-   prescriptions
-   treatment status
-   relevant alerts

Avoid exposing unrelated personal data.

## 11. Empty states

Every empty state should teach the next action.

Bad:

> No medicines.

Better:

> Your pharmacy is empty. Scan a medicine package to add your first
> medicine.

## 12. Error states

Errors should be:

-   human-readable
-   actionable
-   non-technical

Example:

> We couldn't identify this medicine. Try moving closer to the package
> or add it manually.

## 13. Foundation alignment

SCREEN-SPECIFICATION.md defines the detailed current contract: Expo Router,
secure-storage rotating sessions, patient profile API, explicit inventory units,
archive removal, multi-page field-level OCR review and stable dose occurrence IDs.
Sharing yields AccessGrant; code expiry and grant expiry/revocation are separate.
Professional dashboards list recipient-bound grants and enforce field scopes.
Notification preferences are MVP persistence; recovery is deferred.
