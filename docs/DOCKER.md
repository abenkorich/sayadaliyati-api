# API Docker image and persistent files

## Build and run

```sh
docker build --target runtime -t sayadaliyati-api:dev .
cp .env.docker.example .env.docker
# Fill in the runtime database, Redis and authentication settings.
docker compose -f compose.api.yml up -d
```

The API listens on container port 3000, published to VPS loopback port 3000 for
use behind your HTTPS reverse proxy. Set API_PORT when invoking Compose to change
the host port. PostgreSQL, Redis, migrations and private document storage are
managed separately. Container localhost cannot reach another service; configure
reachable database and Redis hostnames or put services on a shared Docker network.
compose.api.yml is independent of the local development docker-compose.yml.

The API and reminder worker use the same image. The worker overrides the command
and has no HTTP healthcheck. It polls as documented in REMINDERS.md; Compose
restart policies restart exited processes but do not restart merely unhealthy APIs.

## Persistent mount

The exact path is `/usr/src/app/dev_data`, with these directories created at startup:

- `imports/`: incoming files for future/manual import workflows.
- `exports/`: exported files and retained output.
- `config/`: operator-managed configuration files.

Compose mounts the named volume `sayadaliyati-api-runtime_dev_data` into both
processes. Recreating containers or rebuilding the image preserves its contents.
Do not run `docker compose down -v` if you want to retain the data; back up the
volume separately. This is a persistence location, not a new import/export API.
The application does not automatically process files dropped here or serve them
publicly. Existing document attachments still use private S3-compatible storage.
PostgreSQL/Redis data are separate and are not moved into this volume.

For a host bind mount instead, provision a directory owned by UID/GID 1000 and use:

```sh
sudo install -d -o 1000 -g 1000 -m 0750 /srv/sayadaliyati/dev_data
docker run -d --name sayadaliyati-api --init \
  --restart unless-stopped \
  --env-file .env.docker \
  -p 127.0.0.1:3000:3000 \
  --mount type=bind,src=/srv/sayadaliyati/dev_data,dst=/usr/src/app/dev_data \
  sayadaliyati-api:dev
```

The container runs as node, UID/GID 1000. The entrypoint checks directory access
and fails clearly when the mounted directory is not writable; it never recursively
changes ownership of your host files. A bind mount masks directories from the
image, so its host permissions must be correct before starting.

## Configuration files

You can optionally place `api.env` at `dev_data/config/api.env`. Both the default
API command and Compose worker command load it with Node's env-file option. Values
already supplied through the container environment take precedence. Changes take
effect on restart. Keep credentials readable only by the required operator and
container user; for example owner UID 1000, mode 0600 for api.env. Other config
files are retained but are not automatically interpreted by the API.

Actual .env files, private key files, dev_data, host dependencies and host build
artifacts are excluded from the Docker context. The runtime image contains compiled
code and production dependencies, built for the target container architecture.

## Migrations

The runtime image does not contain Prisma CLI or automatically migrate the database.
Build the explicit tooling target for one-off schema deployment:

```sh
docker build --target migrate -t sayadaliyati-api:migrate .
docker run --rm --env-file /secure/path/migration.env sayadaliyati-api:migrate
```

migration.env must supply MIGRATION_DATABASE_URL with migration privileges. Grant
the application role its scoped runtime privileges separately; the local grant
script intentionally refuses remote databases. Do not pass migration credentials
to the running API or worker. Apply migrations before expecting readiness to pass.

## Verification and operations

The Docker healthcheck uses `/api/v1/health/ready`, which checks the migrated schema
and Redis. `/api/v1/health/live` only checks the API process. Secrets are supplied
at runtime, never build arguments. Native dependencies are built/installed inside
Linux; no macOS node_modules are copied. Build on your VPS for its architecture,
or use Docker Buildx with its target platform when publishing a multi-platform image.

Reference: [Docker volumes](https://docs.docker.com/engine/storage/volumes/) and
[pnpm container packaging](https://pnpm.io/docker).
