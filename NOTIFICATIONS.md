# Saydaliyati --- NOTIFICATIONS.md

Version: 1.0

## 1. Notification types

``` text
DOSE_DUE
DOSE_MISSED
EXPIRY
LOW_STOCK
PRESCRIPTION
SHARING
SYSTEM
```

## 2. Architecture

``` text
API / Scheduler
 ↓
Redis queue
 ↓
Worker
 ↓
Notification provider
 ↓
Mobile
```

## 3. Dose reminders

Schedules generate due events.

Worker sends notifications according to user preferences.

Prevent duplicate notifications using an idempotency key.

## 4. Missed dose

A missed-dose notification must not prescribe corrective dosing.

Example:

> Your 20:00 dose may have been missed.

Provide navigation to treatment instructions.

## 5. Expiry

Default behavior:

-   notify when approaching expiry
-   allow configurable lead time
-   do not spam

## 6. Low stock

Low-stock thresholds should be explicit.

Examples:

``` text
quantity <= configured threshold
```

or calculated treatment deficit.

## 7. Preferences

Users can configure:

-   dose reminders
-   expiry reminders
-   low-stock alerts
-   sharing notifications
-   system notifications

## 8. API

``` http
GET /api/v1/me/notifications
PATCH /api/v1/me/notifications/:id/read
PATCH /api/v1/me/notifications/read-all
```

## 9. Reliability

Notifications should be:

-   idempotent
-   retryable
-   observable
-   rate limited

Do not send repeated alerts indefinitely after a provider failure.

## 10. Required MVP persistence and contracts

notification_preferences is required per user: doseReminders, expiryReminders,
lowStockAlerts, sharingNotifications, systemNotifications and nullable expiryLeadDays.
See TABLES.md section 32. GET/PATCH /api/v1/me/notification-preferences is the API.
Unconfigured GET returns configured=false, preferences=null. First save requires
all five flags; later saves patch allowlisted fields. Missing settings are not
consent to deliver. Product defaults and lead-time policy remain open.

lowStockThreshold belongs to an inventory row, is null or nonnegative, and uses
that row's explicit unit. Null does not trigger threshold alerts. No global
mixed-unit threshold or AI conversion; treatment deficit needs compatible units.
Archive removes inventory from expiry/low-stock calculations.

Device registration is separate and provider-neutral. Exact push-token API,
protection and production provider remain open before delivery integration.
Use BullMQ and stable occurrence IDs for dose-notification idempotency. Missed-dose
cutoffs, DST handling and retry limits require approval before those slices.

## Implemented preferences slice

GET/PATCH preferences and migration are implemented; see
[docs/NOTIFICATION-PREFERENCES.md](docs/NOTIFICATION-PREFERENCES.md). This persists
explicit owner choices with concurrency protection and transactional audit.
Notification generation, inbox, device registration and delivery remain future work.

## Implemented delivery milestone (D021)

The separate BullMQ worker now creates private DOSE_DUE inbox records. See
[docs/REMINDERS.md](docs/REMINDERS.md) for exact scheduling, consent, retry and
freshness behavior. Device registration and OS push are still unimplemented.
The five-minute notification lifetime is not a clinical missed-dose threshold.
