# Health API — Diagram Map

This document is the visual map of the project. All diagrams use Mermaid so they render directly in GitHub without generated image assets.

## 1. System context

```mermaid
flowchart LR
    Operator[Operator / Browser]
    Proxy[Trusted TLS Reverse Proxy]
    App[Health API]
    DB[(PostgreSQL)]
    Targets[Monitored HTTP/HTTPS Services]
    Hook[Optional Incident Webhook]

    Operator -->|HTTPS| Proxy
    Proxy --> App
    App --> DB
    App -->|Validated outbound checks| Targets
    App -->|Incident opened / resolved| Hook
```

## 2. Runtime architecture

```mermaid
flowchart TB
    Request[Incoming Request] --> Context[Request ID + Access Logging]
    Context --> Headers[Security Headers]
    Headers --> Rate[Global Rate Limiter]

    Rate --> Public{Public probe?}
    Public -->|yes| Probe[/live · /ready · /health/]
    Public -->|no| Auth[Basic Auth]
    Auth --> Origin[Mutation Origin Guard]
    Origin --> Router[REST API + Dashboard]

    Router --> Repo[Repository Layer]
    Repo --> DB[(PostgreSQL)]

    Scheduler[Background Scheduler] --> Claim[Claim Due Services]
    Claim --> Repo
    Claim --> Lease[Expiring Check Lease]
    Lease --> SSRF[SSRF Validator]
    SSRF --> DNS[DNS Resolution + Policy]
    DNS --> Pin[Pin Connection to Approved IP]
    Pin --> Target[Target Service]
    Target --> Result[Health Result]
    Result --> Repo
    Result --> Incident[Incident Transition]
    Incident --> Repo
    Incident --> Notify[Optional Webhook Notifier]
```

## 3. Monitoring check lifecycle

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant R as Repository
    participant DB as PostgreSQL
    participant G as SSRF Guard
    participant T as Target
    participant N as Notifier

    S->>R: claimDueServices(batch)
    R->>DB: SELECT ... FOR UPDATE SKIP LOCKED
    DB-->>R: due services
    R->>DB: set check_lease_until
    R-->>S: claimed services

    loop bounded concurrency
        S->>G: validate target URL
        G->>G: protocol + hostname + IP policy
        G->>G: resolve DNS and pin approved IP
        alt blocked destination
            G-->>S: blocked result
        else approved destination
            S->>T: HTTP(S) request
            T-->>S: status / timeout / network error
        end
        S->>R: persistMonitoringResult
        R->>DB: result + service status + incident transition
        opt incident opened or resolved
            S->>N: send event
        end
        S->>R: release lease / schedule next check
    end
```

## 4. Manual check versus cached status

```mermaid
flowchart LR
    UI[Dashboard]
    Read[GET /services/:id/health]
    Manual[POST /services/:id/check]
    DB[(PostgreSQL)]
    Guard[SSRF + DNS Pinning]
    Target[Target Service]

    UI --> Read
    Read -->|no outbound traffic| DB
    DB --> Read

    UI -->|explicit operator action| Manual
    Manual --> Guard
    Guard --> Target
    Target --> Manual
    Manual --> DB
```

The cached GET path is intentionally side-effect free. Only the explicit POST path performs a live network check.

## 5. Data model

```mermaid
erDiagram
    SERVICES ||--o{ HEALTH_CHECK_RESULTS : has
    SERVICES ||--o{ INCIDENTS : has

    SERVICES {
        uuid id PK
        text name
        text url
        boolean enabled
        integer interval_seconds
        integer timeout_ms
        integer expected_status
        timestamptz next_check_at
        timestamptz check_lease_until
        text last_status
        integer last_status_code
        integer last_latency_ms
        timestamptz last_checked_at
        integer consecutive_failures
        uuid current_incident_id
    }

    HEALTH_CHECK_RESULTS {
        bigint id PK
        uuid service_id FK
        text status
        integer status_code
        integer latency_ms
        text error_code
        text error_message
        timestamptz checked_at
    }

    INCIDENTS {
        uuid id PK
        uuid service_id FK
        text status
        timestamptz started_at
        timestamptz resolved_at
        integer failure_count
        text last_error_code
        text last_error
        text final_status
    }
```

## 6. Incident state machine

```mermaid
stateDiagram-v2
    [*] --> Healthy
    Healthy --> Degraded: first failed check
    Degraded --> Healthy: recovery before threshold
    Degraded --> IncidentOpen: failure threshold reached
    IncidentOpen --> IncidentOpen: continued failure
    IncidentOpen --> Resolved: healthy check
    Resolved --> Healthy
```

The implementation keeps at most one open incident per service.

## 7. SSRF decision path

```mermaid
flowchart TD
    URL[Configured URL] --> Protocol{HTTP or HTTPS?}
    Protocol -->|no| Block[Block]
    Protocol -->|yes| Credentials{URL contains credentials?}
    Credentials -->|yes| Block
    Credentials -->|no| Host[Normalize hostname]
    Host --> Allow{Explicit hostname allowlist?}
    Host --> Resolve[Resolve DNS with timeout]
    Resolve --> Address{Any resolved address private / special?}
    Address -->|yes and not explicitly allowed| Block
    Address -->|no| Pin[Pin socket lookup to validated address]
    Allow -->|allowed internal hostname| Pin
    Pin --> Request[Send request]
    Request --> Redirect{Redirect?}
    Redirect -->|yes| URL
    Redirect -->|no| Result[Return safe health result]
```

Every redirect re-enters the same validation pipeline.

## 8. Deployment topology

```mermaid
flowchart TB
    Internet[Client / Admin Network]
    TLS[TLS Reverse Proxy / Load Balancer]

    subgraph AppNetwork[Application Network]
        App1[Health API Instance 1]
        App2[Health API Instance N]
    end

    subgraph Backend[Internal Backend Network]
        DB[(PostgreSQL 17)]
    end

    Targets[Public / Explicitly Allowed Targets]
    Receiver[Optional Alert Receiver]

    Internet -->|HTTPS| TLS
    TLS --> App1
    TLS --> App2
    App1 --> DB
    App2 --> DB
    App1 --> Targets
    App2 --> Targets
    App1 --> Receiver
    App2 --> Receiver
```

PostgreSQL is the coordination point for work claims and service leases. If multiple public-facing API replicas are used, rate limiting should also move to a shared external store or gateway.

## 9. CI/CD flow

```mermaid
flowchart LR
    Change[Push / Pull Request] --> Test[Test Job]
    Test --> Install[npm ci]
    Install --> DB[PostgreSQL 17 service]
    DB --> Lint[ESLint]
    Lint --> Jest[Jest integration + security tests]
    Jest --> Audit[npm production audit]
    Audit --> Docker[Docker image build]

    Change --> CodeQL[CodeQL analysis]
    Change --> Dependabot[Dependabot updates]

    Docker --> Gate{Push to main?}
    Gate -->|no| Done[Validation complete]
    Gate -->|yes| Tag[Tag image with commit SHA + latest]
    Tag --> GHCR[Push to GHCR]
```

## 10. Documentation relationships

```mermaid
flowchart TB
    README[README.md / README-FA.md]
    Diagrams[DIAGRAMS.md]
    Architecture[ARCHITECTURE.md]
    Design[DESIGN.md]
    Threat[THREAT_MODEL.md]
    Ops[OPERATIONS.md]
    Production[PRODUCTION.md]
    Readiness[PRODUCTION_READINESS.md]
    ADR[docs/adr/*]
    Security[SECURITY.md]
    Contrib[CONTRIBUTING.md]

    README --> Diagrams
    README --> Architecture
    README --> Design
    Architecture --> ADR
    Design --> ADR
    Threat --> Security
    Ops --> Production
    Production --> Readiness
    Contrib --> ADR
```

## Related documents

- [Architecture](ARCHITECTURE.md)
- [Design document](DESIGN.md)
- [Threat model](THREAT_MODEL.md)
- [Operations runbook](OPERATIONS.md)
- [Production guide](PRODUCTION.md)
- [Production readiness](PRODUCTION_READINESS.md)
- [ADR index](adr/README.md)
