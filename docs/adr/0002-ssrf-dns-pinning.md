# ADR-0002: DNS-pinned SSRF-safe outbound checks

- Status: Accepted
- Date: 2026-08-16

## Context

Health API accepts target URLs and performs outbound requests. Without strict validation, an authenticated operator account or configuration mistake could turn the application into an SSRF primitive capable of reaching loopback, private networks, cloud metadata services, or other special-use destinations.

A simple URL regex or a single DNS lookup is insufficient because redirects and DNS rebinding can change the effective destination after validation.

## Decision

Every outbound check must:

1. accept only HTTP/HTTPS URLs;
2. reject embedded URL credentials;
3. resolve the hostname before connecting;
4. reject blocked IPv4/IPv6 ranges unless explicitly allowlisted;
5. pin the network connection to an IP address that passed policy validation; and
6. treat every redirect destination as a new target that must be revalidated.

## Consequences

### Positive

- Blocks common localhost/private/metadata SSRF paths.
- Reduces DNS-rebinding risk by avoiding an implicit second resolution during connection setup.
- Prevents public redirectors from being used as trampolines to private addresses.
- Provides an explicit, reviewable escape hatch for intended internal monitoring.

### Negative

- More code than using plain `fetch()` directly.
- Some unusual DNS/load-balancing setups may require explicit policy tuning.
- Application-level SSRF controls do not replace network egress controls for high-assurance deployments.

## Rejected alternatives

### Validate URL only

Rejected because a syntactically valid public hostname can resolve or redirect to a private destination.

### Validate DNS, then call normal `fetch()`

Rejected because the connection may resolve the hostname again after validation, leaving a DNS-rebinding window.

### Allow all private targets by default

Rejected because the monitor would become an internal network probe if administrative access were compromised.

## Revisit when

Reconsider implementation details if Node.js introduces a simpler first-class way to bind `fetch()` to validated DNS results without weakening redirect policy.
