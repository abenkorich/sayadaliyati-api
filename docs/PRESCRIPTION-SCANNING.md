# Prescription scan preview

The native app crops locally before uploading. A suggested central selection helps
start the task but does not detect personal information. Patients must exclude
names, addresses, IDs, barcodes and patient/doctor headers, inspect the resulting
preview, attest it has no patient details, and separately agree to server/OpenAI
processing. Both confirmations reset on image/crop changes. Use manual entry when
identifying text overlaps medicine lines.

## Server configuration

Set `OPENAI_API_KEY` and `PRESCRIPTION_SCAN_MODEL` as server environment variables.
Choose a model supporting image inputs and strict structured outputs. Missing
configuration disables extraction. Keys are never returned to clients. No database
migration or S3 configuration is required for this transient preview endpoint.

Authenticated PATIENT routes under `/api/v1`:

- GET `/me/prescription-scan/capabilities`: availability without credentials.
- POST `/me/prescription-scan`: multipart `file`, `externalProcessingConsent=true`
  and `medicinesOnlyCropConfirmed=true`. Both attestations are required.

JPEG/PNG only, maximum 5 MiB and 20 million pixels, one image. The API decodes and
re-encodes to JPEG (up to 2400 pixels per edge), stripping embedded metadata before
calling OpenAI. Only those crop bytes and generic transcription instructions go
to the provider: no original filename, account ID or full prescription. Visible
text remains the patient's responsibility; the server cannot prove a crop is free
of identifiers. The endpoint does not persist images or create prescriptions,
documents or treatments. An internal audit records the actor and confirmations.

Requests use the OpenAI Responses API with `store: false`, a strict output schema,
a 45-second timeout and no provider retries. This is not a guarantee of zero
provider retention; the account's data controls and provider policies apply.
Limits are two scans per user per minute and ten per hour, with two concurrent
uploads per API process. Provider failures return sanitized errors.

Suggestions preserve unknowns, forbid catalog IDs and require patient review. The
mobile form receives editable values only after acceptance; saving creates an
unconfirmed manual draft. No dose, schedule or treatment is confirmed automatically.
The current scan UI is implemented in the mobile app; web scan parity is separate.

## Validation

Mocked provider tests cover the outbound body, bounded responses, refusals and
sanitized failures. Synthetic images verify metadata removal. Controller tests
require both confirmations. Mobile tests check crop bounds, consent gating and
that only the cropped URI enters upload data. No real provider call or patient
image was used. Camera interaction and orientation require Android device testing.

## Medicine-box mode

POST `/api/v1/me/prescription-scan/box` uses the same multipart crop, two consent
flags, image sanitization, provider settings, shared rate limits and review gate.
A separate strict schema/prompt extracts name, strength and packaging facts.
`packageInfo` contains nullable `quantity`, `unit`, and `expiryDate`; prescription
quantity, dose and regimen fields stay null. Month/year-only expiry stays null
rather than inventing a day. Audit metadata records `source: MEDICINE_BOX`.

The mobile catalog search requires explicit product selection. Packaging suggestions
can prefill pharmacy stock, but the patient must verify the catalog match and the
quantity actually remaining. Prescription editors accept name/strength only and
clear old catalog links. All values are editable and require normal save/review.
