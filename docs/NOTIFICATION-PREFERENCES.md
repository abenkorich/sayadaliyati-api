# Notification preferences backend

Implemented September 25, 2026 under foundation decisions F14/F15. This slice
persists explicit account settings. It does not schedule or send notifications,
register push devices, infer missed doses, or interpret expiry lead time.

## Routes and behavior

Authenticated active accounts of every role can manage their own settings. Roles
do not grant access to other accounts' preferences. Both routes use the existing
protected Redis rate limit and no-store response headers.

- `GET /api/v1/me/notification-preferences` returns
  `{data: {configured: false, preferences: null}, meta: {}}` before first save.
  Reading never creates a row or fabricates defaults.
- `PATCH /api/v1/me/notification-preferences` first requires all five booleans:
  doseReminders, expiryReminders, lowStockAlerts, sharingNotifications and
  systemNotifications. All false is a valid explicit choice. expiryLeadDays may
  be omitted (stored as null), explicitly null, or a nonnegative integer.
- Subsequent PATCH requests contain one or more allowlisted fields. Omitted
  fields retain their current values. Null clears expiryLeadDays; zero remains
  distinct from null. Flags cannot be null, numbers or string booleans.
- Configured responses have `data.configured=true` and `data.preferences` with
  exactly the five flags and expiryLeadDays. Owner IDs and database timestamps
  are not exposed. Unknown keys, empty patches and owner/role injection fail
  with VALIDATION_ERROR (400).

The storage bound for expiryLeadDays is 0–2147483647 (PostgreSQL INTEGER); it is
not a selected product lead-time policy. A delivery implementation must settle
applicable policy before using these values. Missing settings never authorize
preference-controlled delivery. Per-inventory low-stock thresholds remain
separate; there is no global quantity threshold or unit conversion.

## Persistence and concurrency

Migration `20260925000100_notification_preferences` adds one optional row per
user. The five boolean columns have no database defaults and cannot be null.
The nullable lead time has a nonnegative check. The user foreign key uses RESTRICT.
Existing users are not backfilled. Database readiness now requires this table.

Mutations recheck the active session and account status. A user-row lock
serializes first saves and edits across sessions, including when no preference
row exists yet. Updates to different flags are merged against the current row,
preventing stale read/replace loss. Concurrent writes to the same flag follow
commit order; the API does not implement optimistic revision conflicts.

A changed save and its sanitized audit event commit in one transaction:
NOTIFICATION_PREFERENCES_CONFIGURED or NOTIFICATION_PREFERENCES_UPDATED. Audit
failure rolls back both inserts and updates. Metadata contains request ID/result,
not flag values. Saving identical values succeeds without changing updatedAt or
adding duplicate audit events. No queue or provider is called.

The runtime role can SELECT and INSERT explicit columns and UPDATE only the
settings plus updatedAt. It cannot DELETE, reassign user_id or rewrite created_at.
No delete/reset endpoint or professional/admin bypass is exposed.

## Setup and verification

After the existing local database/storage setup:

```sh
pnpm build
pnpm db:migrate
pnpm db:grant-local
pnpm check
pnpm test:integration
```

Tests cover unconfigured reads, explicit first-save flags, null/zero, partial and
unchanged updates, all-role owner isolation, revoked/inactive accounts, concurrent
first saves and independent edits, database bounds, scoped grants and audit
rollback. Integration fixtures clean only their own users, settings and audit rows.
Push providers, device tokens, notification inbox, scheduling, delivery preferences
UI and Android work remain unimplemented.

## Verified result

`pnpm check` passed, including build, formatting, lint, strict types, schema checks
and 28 unit/API tests. Integration passed 17 database and 86 HTTP/storage tests:
131 unique tests overall. All six migrations applied to an empty isolated schema
with 16 tables, and Prisma detected no model drift against development. OpenAPI
and specification metadata were regenerated. No commit or remote operation was
performed.
