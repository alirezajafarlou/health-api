# ADR-0001: PostgreSQL as persistence and coordination layer

- Status: Accepted
- Date: 2026-08-16

## Context

Health API needs durable storage for services, check history, incidents, and lightweight coordination between monitoring workers. Adding Redis or a dedicated queue would increase operational complexity for the intended small-to-medium deployment profile.

## Decision

Use PostgreSQL as both:

1. the durable source of truth for monitoring data; and
2. the initial coordination mechanism for claiming due monitoring work.

Workers claim due rows with transactional locking and `FOR UPDATE SKIP LOCKED`.

## Consequences

### Positive

- One durable infrastructure dependency instead of PostgreSQL + Redis.
- Coordination and state transitions can be kept close to transactional data.
- Easier Docker Compose and small production deployments.
- Fewer moving parts to secure, back up, and operate.

### Negative

- Very high check volume can create database contention.
- PostgreSQL is not a general-purpose job queue.
- Queue-specific features such as delayed retries, priorities, and dead-letter queues are limited.

## Rejected alternatives

### Redis/BullMQ immediately

Rejected for the initial architecture because the current workload does not justify another stateful dependency.

### In-memory scheduler only

Rejected because it cannot coordinate multiple replicas and loses scheduling state on restart.

## Revisit when

Reconsider this ADR if metrics show claim contention, database load from scheduling becomes material, or workers require independent autoscaling/retry semantics that are awkward to model in PostgreSQL.
