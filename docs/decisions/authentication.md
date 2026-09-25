# Authentication implementation decision — 2026-09-24

Scope: the user authorized defining authentication parameters and implementing
registration, login, refresh and logout after the API/database foundation. This
record makes those choices explicit; it does not authorize medical behavior,
professional verification, account recovery or a production release.

## Credentials and session lifetime

- Passwords: Argon2id, 64 MiB, 3 iterations, parallelism 1, 32-byte hash, independent
  random salt per password. Allow 15–128 Unicode characters, at most 512 UTF-8 bytes.
  Do not trim, normalize or truncate passwords or impose composition rules.
- At most four concurrent expensive password operations per API process. Verify
  unknown-user logins against a dummy Argon2 hash to avoid the trivial timing gap.
- Access tokens: signed HS256 JWTs, fixed issuer/audience, subject/user UUID,
  session UUID, issued/expiry timestamps and random JWT ID. Lifetime 10 minutes,
  never beyond the session's absolute expiry. Every protected request checks the
  database session and current account status; no role in a JWT is trusted.
- Sessions: 30-day absolute lifetime from login/registration, not sliding. Each
  login creates an independent session. Logout revokes only that session.
- Refresh tokens: `sessionUUID.random256bits.HMAC-SHA256`, base64url components.
  A purpose-separated key authenticates the token before any session lookup.
  PostgreSQL stores only SHA-256 of the complete token, never the token itself.
- Session-row locking makes refresh rotation atomic. An authentic previous token
  revokes the whole session and its access tokens; unknown/forged tokens cannot
  revoke a guessed session. Concurrent reuse has one successful rotation, then
  revocation by the rejected replay. Clients must serialize refresh requests and
  sign in again after a lost refresh response; there is no replay grace window.
- A 32-byte random root secret in environment configuration derives separate
  access-signing, refresh-authentication and rate-key keys with HKDF-SHA256.
  There is no application default secret. Rotating this root invalidates existing
  credentials and requires login; multi-key rollover is future work.

## Identity and profile

- Public registration always creates PATIENT/ACTIVE; no role/status/ownership or
  verification fields are accepted. Email/phone verification timestamps stay null.
- Self-declared patient identifiers are permitted for this development baseline;
  this does not prove email/phone ownership or professional identity. Delivery and
  verification requirements must be reviewed before public deployment. No SMS,
  email sender, recovery endpoint or social login is invented.
- Email is trimmed/lowercased; phone must already be international `+` format.
  At least one identifier is required. Names are trimmed/nonempty within 100
  characters. Language and a valid IANA timezone are explicit registration inputs.
- Duplicate registration returns a generic VALIDATION_ERROR without identifying
  the conflicting field. Immediate authenticated registration inherently differs
  from a duplicate attempt; no claim of complete registration anti-enumeration.
- Wrong password/unknown account use the same AUTH_INVALID_CREDENTIALS response.
  Disabled/suspended account status is revealed only after credential verification.
  PENDING_VERIFICATION cannot log in or use protected routes.
- GET/PATCH /me/profile derives ownership exclusively from the session. PATCH
  allows only names, language and timezone. Identifiers and role are read-only.

## Abuse controls

Redis atomic fixed windows (shared across API instances):

- Registration: 5 requests/IP/hour, including structurally invalid parsed bodies.
- Login: 30 requests/IP/minute and 10 requests/normalized identifier/15 minutes.
- Refresh: 60 requests/IP/minute and 10 requests/authentic session/minute.
- Protected routes: 120 requests/IP/minute before credential/database work.

Counters include successes and failures. Return RATE_LIMITED/429 on exhaustion;
there is no permanent account suspension caused by untrusted attempts. Redis keys
contain purpose-separated HMAC digests, not identifiers or IPs. TTLs bound their
retention. Redis errors fail authentication closed with SERVICE_UNAVAILABLE.
Do not trust X-Forwarded-For: use the direct socket address until a specific trusted
reverse-proxy topology is configured. Request bodies are limited to 16 KiB; malformed/oversized JSON is rejected by
the parser before credential processing.

## Persistence and auditing

Register user/profile/session atomically. Session create/rotate/revoke/replay events
and profile mutations have transactional audit entries. Failed logins record a
minimal denial event without supplied identifier, password or token. Audit metadata
contains only outcome and server-generated request ID (profile updates may list
field names, never values). Audit access/retention remain operational production work.

The application role gains only the needed identity/session operations; no deletes
and no role/status/verification updates. Audit records are insert-only for the
application. Local role grants are separate from portable schema migrations.

## Scope and evidence

Backend only: mobile secure storage, cache clearing and screens are not implemented
by this slice. Password recovery, identifier verification delivery, production
retention/deletion and professional provisioning remain explicit future work.

Primary guidance consulted: OWASP Password Storage and Authentication Cheat Sheets;
official node-argon2, jose and Redis documentation/package metadata. Exact versions
are pinned in workspace manifests/lockfile. Regression tests must cover atomic
rotation, authentic replay, forgery, logout, expiry, disabled accounts, role and
cross-account isolation, input allowlists, rate limiting and audit immutability.
