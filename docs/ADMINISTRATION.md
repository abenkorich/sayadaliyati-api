# Administration

The web portal now includes `/admin` with a separate administrator sign-in and an
ADMIN-only API at `/api/v1/admin`. Use the existing API and Redis session service.
Browser JavaScript never receives access tokens, refresh tokens or bootstrap credentials.

## Delivered scope

- Overview counts from the database.
- Users: search email/phone, inspect role/status, activate, suspend or disable.
  Suspending/disabling revokes all sessions. Admin accounts are protected from status
  changes; this console cannot assign roles or elevate accounts.
- Medicines: paginated search, create and edit name, generic name, strength, dosage
  form, source and status. New UI records default to inactive. Required source information
  must come from the administrator; this does not confer clinical verification.
- Doctors, pharmacies, hospitals: create/edit contact directory records, search by name
  or city, draft/active/archive lifecycle. These are directory entries, not professional
  accounts or credential-verification records. Public directory publication and account
  linkage remain separate future features.
- Settings: persisted organization name, support email, administrative default language
  and timezone. These defaults do not rewrite patient preferences or treatment schedules.
- Subscriptions: clearly marked planned; no billing, charging or plan activation.

Every mutation checks the current ADMIN role in a transaction and writes an audit
record with actor, action, target when applicable, request ID and result. Clinical
patient records, password hashes and session secrets are excluded from admin lists.
Search is bounded and paginated (20 per page). No hard-delete endpoint is exposed.

## Administrator credentials and provisioning

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the API repository's private `.env`.
The local values have been generated there; `.env.example` contains no password.
No default secret is compiled into the API or copied to the web environment.
Passwords must have 15–128 Unicode characters and are hashed using the same
Argon2id configuration as normal accounts.

After deploying/building the API and applying migrations and runtime grants:

```sh
pnpm admin:bootstrap
```

This explicit operator command uses `MIGRATION_DATABASE_URL`. It creates a new
active ADMIN and audit record. Re-running it does not reset an existing administrator's
password/status. An existing non-admin email is rejected without promotion.
Changing the environment password alone does not reset an existing account.
Provisioning is never triggered by a public HTTP request or ordinary API startup.

## Database rollout

Migration `20260925000600_administration` adds the two admin tables with constraints.
Run `pnpm db:migrate` in the intended deployment environment. Grant the runtime role
SELECT/INSERT/UPDATE on `admin_directory_entries` and `admin_settings`, UPDATE(status)
on users, and the scoped medicine INSERT/UPDATE columns recorded in
`packages/database/prisma/local-runtime-grants.sql`. The local-only helper is
`pnpm db:grant-local`; remote operators must apply equivalent grants for their runtime
role. Existing audit/session privileges remain required. Deploy the web and API together.

The active API `.env` targets a remote database. This task did not deploy or migrate
that remote database, apply remote grants, or provision its admin account. All migration
and database tests used the isolated local `saydaliyati_test` database.

## Verification

Node 24.21.0; API build, lint, typecheck, Prisma validation and schema formatting pass.
API unit suite: 43 passed; admin database integration: 4 passed. Admin integration covers non-admin rejection, credential
projection, admin protection, revocation, cross-directory IDs, strict validation,
runtime column privileges, persistent settings, audit writes and bootstrap idempotency.
Web types, lint (one pre-existing warning in a registration test config), unit/security
tests (27 passed, including real Redis) and production build pass. Four admin browser tests cover overview, empty states,
directory saves, settings and subscription navigation, access-denied UI and horizontal
overflow on desktop Chromium and Pixel 7 Chromium emulation. Screenshots contain only
explicit synthetic fixture values. Physical devices and remote deployment remain untested.
