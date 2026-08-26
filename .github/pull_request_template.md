## Summary

Describe what changed and why.

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Security hardening
- [ ] Database / migration
- [ ] Operations / deployment
- [ ] Documentation

## Validation

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm test`
- [ ] Docker image builds when deployment files changed

## Security checklist

- [ ] Outbound HTTP changes preserve SSRF/DNS/redirect protections
- [ ] No secrets or local `.env` values are committed
- [ ] Database queries remain parameterized
- [ ] Authentication/authorization behavior is covered when affected

## Architecture / operations

- [ ] Migration added for persistent schema changes
- [ ] Relevant docs updated
- [ ] ADR added/superseded if a major architectural decision changed
