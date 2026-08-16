# Changelog

All notable changes to this project should be documented here.

The format follows the spirit of Keep a Changelog, with changes grouped by impact rather than commit history.

## Unreleased

### Added

- Continuous background monitoring worker with bounded concurrency.
- PostgreSQL-backed service scheduling and expiring leases for multi-instance coordination.
- Persistent health-check history and latency.
- Incident open/resolve lifecycle and optional webhook notifications.
- Manual check endpoint separated from cached dashboard health reads.
- Production authentication, rate limiting, mutation origin checks, and security headers.
- Liveness, readiness, Prometheus-style metrics, request IDs, and structured logs.
- Versioned database migrations.
- Production deployment, architecture, threat-model, operations, ADR, and Persian documentation.
- CodeQL, Dependabot, production dependency audit, and Docker-build CI gates.

### Security

- Added SSRF protection for private/special IPv4 and IPv6 destinations.
- Added DNS-pinned outbound connections to reduce DNS-rebinding risk.
- Added redirect destination re-validation.
- Rejected target URLs containing credentials or unsupported protocols.
- Hardened container runtime with non-root execution, read-only filesystem support, dropped capabilities, and no-new-privileges.
- Replaced fast password hashing used only for fixed-length comparison with padded timing-safe direct comparison.

### Changed

- Dashboard now reads persisted health state instead of generating an outbound check for every rendered/search result.
- `/health` now reflects readiness semantics; `/live` and `/ready` are available explicitly.
- Docker image publishing uses immutable commit SHA tags in addition to `latest` on `main`.
