# AI administration

Open `/admin` → **AI**. Only an active ADMIN session may read settings, usage,
statistics and request history or change settings and verify connectivity.

## Settings and status

`OPENAI_API_KEY` remains in the API's private environment file. It is never returned,
imported, exported or editable through the browser. `PRESCRIPTION_SCAN_MODEL` supplies
the default model. The administrator may pause extraction, override the model, set
input/cached-input/output prices in USD per million tokens and set a monthly USD
planning budget. Blank model uses the environment default. Rates are manual; update
them for the chosen model. These settings apply to both prescription and medicine-box
scans. Existing crop, consent, rate limits and review requirements remain in force.

**Verify connection** checks `GET https://api.openai.com/v1/models/{model}` with the
server credential, a five-second timeout and no redirects. No inference request or
medical content is sent. This verifies credential/model access only, not vision or
structured-output compatibility, available credits or ability to perform a paid scan.
A restricted key may allow Responses while disallowing model retrieval. Results and
check time persist; changing the key or effective model invalidates the displayed
check. Verification is limited to three checks per admin per minute. Provider bodies
and diagnostics never reach the browser. Last-check time is shown; verification does
not run automatically on page loads.

## Usage, history and credit estimates

New outbound scan attempts create a durable metadata record before contacting OpenAI.
Success and failure update outcome, elapsed milliseconds, reported input/cached/output
tokens and an estimated USD cost. Usage is captured even if a completed provider
response is later rejected by transcription validation. Unknown token usage and cost
remain null. A process interruption leaves a `STARTED` record (displayed as pending /
interrupted); no automatic provider retry or duplicate inference is triggered.

Request history deliberately excludes user IDs, images, prompts, names, medicine text,
provider response bodies and credentials. It contains a random local request ID,
feature, requested model, timestamps, outcome and coarse error category. Settings
changes and verifications have separate administrator audit entries.

Filters cover 7, 30 or 90 days, feature and outcome; history is paginated at 25 rows.
Totals include all matching records, not only the current page. Daily chart buckets
are UTC. Latency averages completed requests; success rate excludes unfinished ones.
Missing token usage is excluded from token sums and counted separately. No historical
token usage is fabricated or backfilled from old audit events.

Cost = ((input − cached) × input rate + cached × cached rate + output × output rate)
/ 1,000,000, rounded to eight decimal places. Blank cached rate uses input rate.
Missing input or output rates leave cost unknown. Zero rates are allowed. Estimates
are saved using rates at request time and never retrospectively repriced. Failed
requests with reported usage can still have a cost.

**Credits & budget** is the calendar-month UTC planning budget minus all known app
scan estimates, independent of history filters. It is not purchased OpenAI credit or
an enforced cap. Remaining budget is unavailable if any request has unknown cost.
The provider account balance is explicitly unavailable, with a link to provider
billing. This integration does not reconcile organization invoices, other applications,
credits, discounts, taxes or provider-side adjustments. No provider admin key is used.

## API and deployment

- GET `/api/v1/admin/ai/settings`
- PATCH `/api/v1/admin/ai/settings` (complete settings object, strict validation)
- POST `/api/v1/admin/ai/verify`
- GET `/api/v1/admin/ai/usage?days=30&page=1&feature=PRESCRIPTION&status=SUCCEEDED`

The portal forwards these through its existing server session, exact-origin mutation
protection and session-version checks. Mutations recheck the live admin role/session
inside their audit transaction. Secrets and billing-provider access remain server side.

Apply migration `20260926000300_ai_administration` and the updated runtime grants
before starting the new API. Runtime needs SELECT/INSERT/UPDATE on `ai_settings` and
`ai_requests`. Readiness now requires both tables. Build/generate the Prisma client,
API and web portal. Existing API env variables suffice; no new credential is required.
Production database migrations, permission grants and deployment are separate release
steps; this implementation was tested against the isolated local test database only.

## References

- [OpenAI model retrieval](https://developers.openai.com/api/reference/resources/models/methods/retrieve)
- [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses/create)
- [OpenAI organization usage and costs](https://platform.openai.com/docs/api-reference/usage)

## Validation

Verified: API unit tests, isolated local PostgreSQL admin integration tests, web
unit/session tests with real isolated Redis, four AI browser tests across Chromium
desktop and Pixel 7, and API/web production builds. AI code passes lint and typecheck.
Full web lint still reports the pre-existing `sessionVersion.current` render in
`src/components/portal.tsx` and the registration test configuration warning.
