# Operations Runbook

## Deployment assumptions

The reference deployment is a single-tenant/admin-facing service behind a trusted HTTPS reverse proxy or load balancer with PostgreSQL on a private network.

## Required production configuration

At minimum:

```text
NODE_ENV=production
DB_HOST=postgres
DB_PORT=5432
DB_USER=healthapi
DB_PASSWORD=<strong-random-secret>
DB_NAME=healthapi
ADMIN_USERNAME=<admin-user>
ADMIN_PASSWORD=<strong-secret-at-least-16-characters>
TRUST_PROXY=true
```

Production startup fails if authentication is disabled or credentials are missing/weak.

## Deploy with Docker Compose

```bash
cp .env.example .env
# edit .env with production secrets
docker compose pull
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs --tail=200 api
```

## Health checks

Liveness:

```bash
curl -fsS http://127.0.0.1:3000/live
```

Readiness:

```bash
curl -fsS http://127.0.0.1:3000/ready
```

Interpretation:

- `/live` fails: process/container is unhealthy.
- `/live` passes but `/ready` fails: application process is alive but PostgreSQL is unavailable or not ready.

## Metrics

Scrape authenticated `/metrics` through the trusted proxy. Alert at minimum on:

- readiness failure
- process restarts
- sustained growth in open incidents
- high process memory
- unexpected drop in monitored-service count

## Database migration

Migrations run through the application migration layer and are versioned under `db/migrations/`.

Before upgrading a production database:

1. Take a verified backup.
2. Deploy one application revision first when possible.
3. Verify `/ready` and logs after migrations complete.
4. Roll out remaining replicas.

## Backup

Example logical backup:

```bash
pg_dump -Fc \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "health-api-$(date +%Y%m%d-%H%M%S).dump"
```

Store backups outside the application host and apply an explicit retention policy.

## Restore drill

Test restores periodically in an isolated database:

```bash
createdb healthapi_restore_test
pg_restore --clean --if-exists -d healthapi_restore_test health-api-YYYYMMDD-HHMMSS.dump
```

A backup that has never been restored successfully should not be considered verified.

## Incident: API is not ready

1. Check `/live` and `/ready` separately.
2. Inspect API logs for PostgreSQL errors.
3. Check PostgreSQL container/service health.
4. Validate credentials and network reachability.
5. Avoid repeatedly restarting the API if the database is the actual failure.

## Incident: checks stop advancing

1. Confirm `/ready` is healthy.
2. Inspect worker logs.
3. Query services with stale `next_check_at` / `lease_until` values.
4. Confirm worker is enabled and concurrency is non-zero.
5. Check target DNS/network reachability.
6. Expired leases recover automatically; do not manually clear active leases unless the owning workers are known to be gone.

## Incident: many targets become unreachable at once

Treat this first as a monitor/network problem, not as dozens of independent service outages.

Check:

- DNS resolver health
- outbound firewall/NAT
- proxy routing
- host network saturation
- recent target-policy changes

## Incident: suspected SSRF attempt

1. Preserve structured logs and request IDs.
2. Identify who changed/created the target definition.
3. Disable the suspicious service.
4. Review target hostname, redirects, and resolved addresses.
5. Confirm `ALLOW_PRIVATE_TARGETS` has not been enabled broadly.
6. Rotate admin credentials if compromise is plausible.
7. Apply network-level egress restrictions if the deployment requires stronger isolation.

## Secret rotation

Rotate database/admin/webhook credentials by updating the deployment secret source and restarting/redeploying the application. Do not commit secrets to `.env.example` or repository files.

## Graceful shutdown

SIGTERM/SIGINT stops new work, drains the monitor, closes the HTTP server, and closes the database pool. Orchestrators should allow a termination grace period longer than the configured check timeout.

## Production checklist

- TLS enforced
- strong unique admin password
- PostgreSQL not publicly reachable
- tested backup + restore
- logs shipped/retained
- `/ready` monitored
- `/metrics` scraped if used
- broad private-target bypass disabled unless explicitly required
- shared rate limiter added if multiple public-facing replicas are deployed
