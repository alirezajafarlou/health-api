# ADR-0003: Expiring per-service leases for multi-instance monitoring

- Status: Accepted
- Date: 2026-08-16

## Context

`FOR UPDATE SKIP LOCKED` prevents two workers from selecting the same service inside the claim transaction, but the database row lock disappears when that transaction commits. A network check may continue for seconds after the commit, so another worker could otherwise claim the same service before the first check finishes.

Keeping a database transaction open for the entire network call would hold locks during slow/untrusted I/O and is undesirable.

## Decision

When a worker claims a service, persist an expiring `lease_until` timestamp that outlives the claim transaction.

A service is claimable only when its schedule is due and its lease is absent/expired. The lease duration must exceed the expected check duration with enough margin for processing and persistence.

## Consequences

### Positive

- Prevents overlapping checks across replicas after the claim transaction commits.
- Avoids holding database locks during network I/O.
- Recovers automatically after worker crashes because leases expire.
- Keeps multi-instance coordination inside PostgreSQL.

### Negative

- Lease duration must be configured conservatively relative to request timeout.
- Severe clock skew between application/database environments can complicate reasoning; database time should be preferred where possible.
- A stuck check can delay the next attempt until lease expiry.

## Rejected alternatives

### Hold transaction/row lock for full network request

Rejected because untrusted network latency would extend database transactions and lock lifetime.

### `SKIP LOCKED` without a persistent lease

Rejected because it protects only the short claim transaction, not the actual check execution window.

### In-memory mutex

Rejected because it does not coordinate separate processes/replicas.

## Revisit when

If monitoring work moves to a dedicated queue system, queue visibility timeouts may replace this lease mechanism.
