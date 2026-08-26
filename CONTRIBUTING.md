# Contributing

Thanks for contributing to Health API.

## Development setup

Requirements:

- Node.js 24+
- npm
- PostgreSQL 17 (or Docker)

Install dependencies:

```bash
npm ci
```

For local development without application authentication:

```bash
AUTH_DISABLED=true MONITOR_ENABLED=false npm start
```

Never use `AUTH_DISABLED=true` with `NODE_ENV=production`.

## Quality checks

Before opening a pull request, run:

```bash
npm run lint
npm run format:check
npm test
```

When changing Docker/deployment behavior, also run:

```bash
docker build -t health-api:local .
```

## Pull request expectations

A good PR should:

- have one clear purpose;
- include tests for behavior changes;
- preserve SSRF protections for all outbound requests;
- avoid making dashboard reads trigger hidden network fan-out;
- include a migration for persistent schema changes;
- update relevant architecture/operations documentation;
- keep secrets and local `.env` files out of Git history.

## Architecture decisions

Changes that alter a major architectural invariant should add or supersede an ADR under `docs/adr/`.

Examples:

- introducing Redis or a queue;
- changing the target-network security model;
- replacing the worker lease strategy;
- changing authentication architecture;
- changing the database as source of truth.

See [docs/adr/README.md](docs/adr/README.md).

## Database changes

Do not edit only `db/schema.sql` for an existing deployment. Add an idempotent/versioned migration under `db/migrations/` and keep the fresh-install schema consistent with the migrated end state.

## Security-sensitive changes

Treat these areas as security-sensitive:

- `src/ssrf.js`
- `src/security.js`
- authentication configuration
- Docker/container privileges
- secret handling
- database query construction

For target-checking changes, include tests for private/special IPv4 and IPv6 ranges, redirects, and DNS behavior where relevant.

## Commit style

Conventional-style commit subjects are preferred, for example:

```text
feat: add incident webhook delivery
fix: prevent overlapping manual checks
docs: record worker lease decision
test: cover redirect-to-private SSRF case
```

## Reporting security issues

Follow [SECURITY.md](SECURITY.md). Do not publish exploit details in a public issue before the maintainer has had a reasonable opportunity to review them.
