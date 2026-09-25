# Saydaliyati --- AUDIT-LOGGING.md

Version: 1.0

## 1. Purpose

Provide traceability for sensitive actions.

## 2. Events

Audit at minimum:

-   login/security events where appropriate
-   medicine/inventory mutations
-   prescription mutations
-   treatment mutations
-   sharing creation
-   sharing redemption
-   sharing revocation
-   professional access
-   sensitive admin changes

## 3. Structure

Conceptual:

``` text
actor
action
resource type
resource id
timestamp
result
request id
metadata
```

## 4. Do not log

Never store in ordinary logs:

-   passwords
-   access tokens
-   share codes in plaintext
-   full prescription images
-   unnecessary medical content

## 5. Share codes

Only a cryptographic hash should be persisted for verification.

## 6. Retention

Define retention based on security, legal and operational requirements.

Audit records should not be casually deleted by application users.

## 7. Foundation lifecycle events

Record session creation/rotation/revocation, INVENTORY_ARCHIVED, field confirmation,
prescription state changes, SHARE_CREATED, SHARE_REDEEMED, SHARE_SESSION_CANCELLED,
ACCESS_GRANT_CREATED, ACCESS_GRANT_REVOKED and SHARED_DATA_VIEWED. Future connection
events do not authorize access. Sharing audit references session and/or grant,
patient and actor when known. Unmatched guesses never fabricate a patient ID.

Grant creation/revocation and inventory archive write audit transactionally.
No archive cascades into audit history. Original extraction history lives in
protected field revisions, never ordinary logs. audit_logs.metadata can carry
sanitized result/request correlation, never tokens, codes, document content or
signed URLs. Retention/operational-access policy remains open before production.
