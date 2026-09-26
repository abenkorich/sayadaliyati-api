# Scan preferences

Apply migration `20260926000400_scan_preferences` and refresh the runtime grants (`pnpm db:grant-local` for a local environment) before releasing the updated mobile app. The runtime database role needs UPDATE on `patient_profiles.scan_processing_consent` as included in `local-runtime-grants.sql`.

Authenticated patient routes:

- GET `/api/v1/me/scan-preferences`: `{ data: { configured, processingConsent }, meta: {} }`.
- PATCH `/api/v1/me/scan-preferences`: strict body `{ processingConsent: boolean }`; returns the saved configuration.

A null database value means setup has never been completed. False is an explicit saved refusal. Both medicine and prescription scans share this account preference. Camera permission remains controlled by the operating system, and phone storage uses the native selected-photo picker without requesting broad library access.

The app still requires explicit review of each medicine-only crop before upload and review of extracted suggestions before changing the draft. Saving permission does not upload anything. Existing scan multipart consent fields remain required for older clients.
