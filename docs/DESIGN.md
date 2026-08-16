# Design Document

## Purpose

Health API is a lightweight HTTP/HTTPS service monitor for small-to-medium, single-tenant deployments. It should be simple to operate, safe to expose behind TLS, and capable of continuous checks without requiring Redis or a dedicated queue.

## Goals

- Periodically check registered HTTP/HTTPS endpoints.
- Persist current state, history, latency, and incidents.
- Support more than one application replica safely.
- Prevent user-controlled target URLs from becoming an SSRF primitive.
- Keep the dependency and operational footprint small.
- Provide useful health probes, metrics, and structured logs.
- Fail closed when production authentication is misconfigured.

## Non-goals

- Multi-tenant SaaS isolation and RBAC.
- Synthetic browser monitoring.
- Global probing from multiple geographic regions.
- Full alert-routing/on-call platform functionality.
- Distributed tracing backend.
- Replacing a dedicated observability platform at very large scale.

## Key design decisions

1. **PostgreSQL is the source of truth and initial coordination layer.**
   This keeps deployment simple and avoids introducing Redis until scale actually requires it.

2. **Network checks are performed by a background worker.**
   Dashboard reads do not trigger outbound traffic. Manual checks use an explicit mutation endpoint.

3. **Due work is claimed with `SKIP LOCKED` plus an expiring lease.**
   `SKIP LOCKED` handles claim races; the persistent lease handles the period after the transaction commits.

4. **SSRF protection is enforced at connection time.**
   DNS results are policy-checked and the outbound connection is pinned to an approved IP. Redirect destinations are revalidated.

5. **Basic Auth is intentionally minimal.**
   For the current single-admin deployment profile it is sufficient when used behind TLS. Production startup rejects disabled or weakly configured authentication.

## Request model

### Read path

`GET /services`, `GET /services/:id/health`, history, incidents, and metrics read persisted state. They do not fan out to monitored services.

### Manual check path

`POST /services/:id/check` performs one immediate check through the same checker and persistence pipeline used by the worker. It is rate-limited and protected by the same SSRF policy.

### Background path

The worker periodically claims due services, checks them with bounded concurrency, persists results, advances `next_check_at`, and updates incident state.

## Failure model

### Database unavailable

- `/live` remains healthy while the process is alive.
- `/ready` becomes unhealthy.
- Management operations that require PostgreSQL fail.
- The worker cannot claim new work until the database returns.

### Target timeout/unreachable

A result is persisted as `unreachable`. Consecutive failures advance incident logic according to the configured threshold.

### Worker crash during check

The service remains leased only until `lease_until`. Another worker can claim it after expiration.

### Webhook failure

Monitoring state is persisted before notification. Alert delivery failure must not roll back the health result or incident transition.

## Consistency model

The latest service state and each historical result are updated through PostgreSQL. Incident transitions are enforced with database constraints, including the invariant that a service has at most one open incident.

## Security model

- Credentials are provided through environment configuration, not committed secrets.
- Credential comparison is timing-safe and does not hash the presented password with a fast general-purpose hash.
- Mutation requests are protected against obvious cross-site browser requests.
- Security headers and CSP reduce browser attack surface.
- Target URLs cannot contain credentials and must use HTTP or HTTPS.
- Public IP targets are allowed by default; private/special-use targets require explicit policy exceptions.

See [THREAT_MODEL.md](THREAT_MODEL.md) for the abuse-case view.

## Performance expectations

The API is database-bound for normal reads and should remain inexpensive because dashboard rendering does not perform N outbound checks. Network monitoring throughput is controlled by worker concurrency and per-service intervals.

## Evolution triggers

Introduce additional infrastructure only when metrics justify it:

- External distributed rate limiter: multiple public-facing replicas.
- Redis/BullMQ or another queue: PostgreSQL claim contention becomes material.
- Separate worker deployment: independent scaling or fault isolation is required.
- Multi-user auth/RBAC: deployment becomes multi-tenant or internet-facing to multiple operators.
