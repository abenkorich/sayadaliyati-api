# Saydaliyati --- PRIVACY-DATA-LIFECYCLE.md

Version: 1.0

## 1. Data categories

Examples:

``` text
Account
Profile
Medicine master data
Inventory
Prescription
Treatment
Medication events
Sharing/access
Uploaded documents
AI interaction metadata
Audit
```

## 2. Principle

Collect only what is required for the product.

## 3. Storage

Sensitive user data must remain in controlled private infrastructure.

## 4. Access

Access must be:

``` text
authenticated
authorized
scoped
audited where appropriate
```

## 5. Uploaded files

Prescription and package images require:

-   private storage
-   authorization
-   controlled retention
-   secure deletion process
-   no public URLs

## 6. Deletion

Account deletion should be a controlled lifecycle.

Do not rely on uncontrolled database cascades for all health-related
data.

Define:

``` text
request
verification
retention obligations
deletion/anonymization
backup lifecycle
completion
```

## 7. Legal review

Before production, obtain appropriate Algerian legal/privacy review.

Do not claim legal compliance merely because technical controls exist.

## 8. AI

Do not send more patient information to an AI provider than required for
the specific task.

Document provider retention and processing terms before production.

## 9. Foundation lifecycle distinctions

Inventory removal sets archived_at, preserving clinical and audit references;
physical purge is governed by separately approved retention/account-deletion policy.
Multi-page prescription files and field revisions have controlled ownership and
retention. Grant revocation blocks future reads/URL issuance; already-issued URLs
retain only their bounded short lifetime, and downloaded data cannot be recalled.
Cancelling/expiring a code does not revoke a grant. Consent distinguishes these
lifetimes and discloses original documents included by READ_PRESCRIPTIONS.
Missing notification settings are not consent; persist explicit preferences.
