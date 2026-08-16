# Security Policy

## Supported deployment model

Health API is intended to run behind TLS (reverse proxy, ingress, or managed load balancer). Production startup requires administrator credentials and refuses `AUTH_DISABLED=true`.

## Security controls

- HTTP Basic authentication for the dashboard and management API. Use only over HTTPS.
- Constant-time credential comparison.
- Global and manual-check rate limits.
- Same-origin mutation guard for browser requests.
- Strict security headers and Content Security Policy.
- Request body and input size limits.
- Parameterized PostgreSQL queries.
- SSRF defenses with protocol restrictions, credential rejection, DNS resolution checks, private/special IP blocking, redirect re-validation, and DNS pinning for the actual TCP connection.
- Explicit `TARGET_ALLOWLIST` for intentionally monitored private hostnames.
- Non-root, read-only API container with dropped Linux capabilities.
- Database isolated on an internal Docker network.
- CodeQL and dependency update automation.

## Private/internal services

Private address space is denied by default. Prefer explicit host allowlisting:

```text
TARGET_ALLOWLIST=api.internal.example,*.svc.example
```

Avoid `ALLOW_PRIVATE_TARGETS=true` unless the deployment network itself is strongly isolated and only trusted administrators can create service definitions.

## Reporting vulnerabilities

Do not publish exploit details in a public issue. Contact the repository owner privately and include the affected commit, reproduction steps, impact, and a proposed mitigation when available.
