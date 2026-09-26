# Scan preferences

Deploy the API containing `ScanPreferencesController` and apply both `20260926000400_scan_preferences` and `20260926000500_scan_preferences_grant` before testing the updated mobile app. Pushing app code alone does not add the live API route or migrate the database.

The grant migration adds UPDATE on `patient_profiles.scan_processing_consent` for the standard `saydaliyati_app` role when it exists. For a custom runtime role, the database administrator must grant that column-level privilege to that role. Existing profile SELECT privileges are also required. Readiness now checks the scan column and UPDATE privilege.

Use the migration tooling described in [Docker deployment](./DOCKER.md#verification-and-operations); the runtime image does not automatically migrate. With the repository tooling and `MIGRATION_DATABASE_URL` configured, run `pnpm db:migrate`, then rebuild/restart the API. Confirm `/api/v1/health/ready` succeeds. An unauthenticated GET to `/api/v1/me/scan-preferences` should return 401, not 404; after signing in as a patient, GET and PATCH should return 200.

Camera and phone photo selection work independently of AI availability. Camera permissions are granted by the operating system; saved processing consent is stored by this API. Neither granting camera access nor saving processing consent uploads a photo.

Authenticated patient routes:

- GET `/api/v1/me/scan-preferences`: `{ data: { configured, processingConsent }, meta: {} }`.
- PATCH `/api/v1/me/scan-preferences`: strict body `{ processingConsent: boolean }`; returns the saved configuration.

A null database value means setup has never been completed. False is an explicit saved refusal. Both medicine and prescription scans share this account preference. Camera permission remains controlled by the operating system, and phone storage uses the native selected-photo picker without requesting broad library access.

The app still requires explicit review of each medicine-only crop before upload and review of extracted suggestions before changing the draft. Saving permission does not upload anything. Existing scan multipart consent fields remain required for older clients.
