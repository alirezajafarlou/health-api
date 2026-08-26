# Production Deployment

## Required controls

1. Put Health API behind HTTPS. Basic authentication must never be sent over plaintext HTTP outside a trusted local development environment.
2. Use long, unique values for `DB_PASSWORD` and `ADMIN_PASSWORD`.
3. Keep `ALLOW_PRIVATE_TARGETS=false`; allowlist only the internal hostnames that must be monitored.
4. Set `TRUST_PROXY=true` only when traffic can reach the app exclusively through a trusted reverse proxy.
5. Back up the PostgreSQL volume and test restore procedures.
6. Monitor `/live` for process liveness and `/ready` for database readiness.
7. Protect port 3000 at the network layer if TLS terminates elsewhere.

## Continuous monitoring model

Workers atomically claim due rows using PostgreSQL `FOR UPDATE SKIP LOCKED`. Multiple API replicas can therefore run the scheduler without double-claiming the same due service in the normal case. Health checks have bounded concurrency, per-service intervals/timeouts, persistent results, incident lifecycle tracking, retention cleanup, and optional incident webhooks.

## API behavior change from v1

`GET /services/:id/health` now returns the last persisted status and does not create outbound traffic. Use `POST /services/:id/check` for an immediate manual check. This prevents dashboard refresh/search operations from generating an N+1 burst of outbound health checks.

## Recommended reverse proxy settings

- TLS 1.2+ / TLS 1.3
- Request body cap at or below 32 KiB
- Preserve `Host`
- Set `X-Forwarded-Proto` and `X-Forwarded-Host`
- Add an external rate limit when running multiple replicas
- Restrict access to an admin/VPN network when possible

## Scaling notes

PostgreSQL is the scheduler coordination point. For hundreds to low-thousands of endpoints this keeps the architecture simple. At materially larger scale, split the checker into dedicated worker processes and consider a durable queue plus distributed rate limiting.

## Incident webhooks

Set `ALERT_WEBHOOK_URL` to receive JSON events when incidents open or resolve. Set `ALERT_WEBHOOK_TOKEN` to send a Bearer token. Webhook delivery is best-effort and never blocks persistence of monitoring state.
