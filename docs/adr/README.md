# Architecture Decision Records

ADRها تصمیم‌های معماری مهم پروژه را ثبت می‌کنند. هر ADR باید مسئله، تصمیم، پیامدها و جایگزین‌های ردشده را توضیح دهد.

## فهرست

- [ADR-0001 — PostgreSQL as persistence and coordination layer](0001-postgresql-coordination.md)
- [ADR-0002 — DNS-pinned SSRF-safe outbound checks](0002-ssrf-dns-pinning.md)
- [ADR-0003 — Expiring per-service leases for multi-instance monitoring](0003-expiring-service-leases.md)

## وضعیت‌ها

- `Accepted`: تصمیم فعلی پروژه است.
- `Superseded`: ADR جدیدی جای آن را گرفته است.
- `Deprecated`: دیگر نباید برای توسعه جدید استفاده شود.
