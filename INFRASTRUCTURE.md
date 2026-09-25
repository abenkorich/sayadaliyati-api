# Saydaliyati --- INFRASTRUCTURE.md

Version: 1.0

## 1. Initial deployment

Recommended services:

``` text
Nginx
API
Worker
PostgreSQL
Redis
Object storage
Monitoring
```

Docker Compose is approved for the first controlled deployment.

## 2. Network

Public:

``` text
443 → Nginx
```

Private:

``` text
API → PostgreSQL
API → Redis
Worker → PostgreSQL
Worker → Redis
Worker → object storage
```

Do not expose PostgreSQL or Redis publicly.

## 3. Domains

Recommended logical endpoints:

``` text
api.<domain>
admin.<domain>
```

Mobile communicates only with HTTPS API.

## 4. Secrets

Use environment secrets.

Never commit:

-   DB passwords
-   JWT secrets
-   API keys
-   object storage credentials
-   notification provider credentials

## 5. Backups

PostgreSQL:

-   automated backups
-   retention policy
-   encrypted storage
-   restore testing

Backups are not complete until restoration has been tested.

## 6. Object storage

Use private buckets. Local development uses MinIO; production uses private
S3-compatible storage. No production provider is selected by this specification.

Files:

-   prescription images
-   medicine images
-   package images
-   other user uploads

Access through short-lived signed URLs.

## 7. Redis

Use for:

-   BullMQ queues
-   temporary share-code state where appropriate
-   rate limiting
-   caching

Do not make Redis the source of truth for permanent data.

## 8. Worker

Worker handles:

-   OCR
-   AI jobs where asynchronous
-   notifications
-   imports
-   expiry processing
-   cleanup jobs

Jobs must be idempotent.

## 9. Monitoring

Monitor:

-   API latency
-   error rate
-   DB health
-   Redis health
-   queue depth
-   worker failures
-   storage failures
-   notification failures

## 10. Deployment

Recommended:

``` text
build
 ↓
test
 ↓
migration check
 ↓
deploy
 ↓
health check
 ↓
rollback if needed
```

Never deploy blindly over a failed migration.

## 11. Horizontal scaling

API should remain stateless.

Future:

``` text
Load balancer
 ↓
API x N
 ↓
PostgreSQL / Redis
```

Workers can scale independently.

## 12. Disaster recovery

Document:

-   restore database
-   restore object storage
-   rotate secrets
-   redeploy API
-   redeploy worker
-   validate health
