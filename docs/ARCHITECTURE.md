# Architecture

Health API is intentionally small: one Node.js application, PostgreSQL as the durable state/coordination layer, and an optional reverse proxy in front of the service.

## System context

```mermaid
flowchart LR
    U[Operator / Browser] -->|HTTPS + Basic Auth| RP[Reverse Proxy / Load Balancer]
    RP --> API[Health API]
    API --> DB[(PostgreSQL)]
    API -->|HTTP/HTTPS checks| T[Monitored Services]
    API -->|optional incident webhook| W[Webhook Receiver]
    P[Prometheus] -->|GET /metrics| RP
```

## Runtime components

```mermaid
flowchart TB
    subgraph APP[Health API process]
        HTTP[Express API + Dashboard]
        SEC[Auth / Rate Limit / Origin Guard]
        WORKER[Monitoring Worker]
        CHECKER[SSRF-safe HTTP Checker]
        REPO[Repository Layer]
        NOTIFY[Incident Notifier]
    end

    HTTP --> SEC
    HTTP --> REPO
    HTTP --> CHECKER
    WORKER --> REPO
    WORKER --> CHECKER
    WORKER --> NOTIFY
    CHECKER --> TARGETS[Public / allowlisted targets]
    REPO --> DB[(PostgreSQL)]
    NOTIFY --> WEBHOOK[Optional webhook]
```

## Data model

```mermaid
erDiagram
    SERVICES ||--o{ HEALTH_CHECK_RESULTS : has
    SERVICES ||--o{ INCIDENTS : has

    SERVICES {
        uuid id PK
        text name
        text url
        integer interval_seconds
        integer timeout_ms
        integer expected_status
        boolean enabled
        timestamptz next_check_at
        timestamptz lease_until
        text latest_status
        integer consecutive_failures
    }

    HEALTH_CHECK_RESULTS {
        bigint id PK
        uuid service_id FK
        timestamptz checked_at
        text status
        integer status_code
        integer latency_ms
        text error_code
        text error_message
    }

    INCIDENTS {
        bigint id PK
        uuid service_id FK
        text status
        timestamptz started_at
        timestamptz resolved_at
    }
```

## Background check flow

```mermaid
sequenceDiagram
    participant W as Worker
    participant DB as PostgreSQL
    participant C as SSRF-safe Checker
    participant S as Target Service
    participant N as Notifier

    W->>DB: Claim due services with SKIP LOCKED
    DB-->>W: Services + expiring leases
    loop each claimed service (bounded concurrency)
        W->>C: Check service
        C->>C: Validate URL, DNS and IP policy
        C->>S: DNS-pinned HTTP(S) request
        S-->>C: Response / timeout / error
        C-->>W: status + latency + safe error
        W->>DB: Persist result and update incident state
        opt incident opened/resolved
            W->>N: Emit event
        end
    end
```

## Multi-instance coordination

PostgreSQL is used for both persistence and lightweight work coordination. `FOR UPDATE SKIP LOCKED` prevents multiple workers from claiming the same service inside the claim transaction. A time-bounded `lease_until` remains after the transaction so long-running network checks do not overlap across replicas. If a worker crashes, the lease expires and the service becomes claimable again.

## Security boundaries

- The dashboard and management API are authenticated.
- Liveness/readiness probes are intentionally unauthenticated.
- `/metrics` is authenticated.
- Target URLs are treated as untrusted input.
- Outbound requests are constrained by the SSRF policy and DNS pinning.
- PostgreSQL is not published to the host in the provided Compose topology.
- TLS is a deployment boundary and must be terminated by a trusted proxy/load balancer.

## Scaling model

For the intended single-tenant/admin-facing deployment, PostgreSQL coordination avoids an additional queue dependency. Multiple API/worker replicas can share the same database. At larger public scale, add an external distributed rate limiter and consider separating API and worker processes operationally.
