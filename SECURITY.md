# Security Policy

## Reporting a Vulnerability

Email maintainers directly. Do not open a public GitHub issue.

## Supported Versions

Only the latest production deployment (main branch) receives security patches.

## Security Controls

| Control | Status |
|---------|--------|
| CSP (Content Security Policy) | Enforced via `_headers` + Worker middleware |
| CSRF protection | Origin-based validation on all state-changing endpoints |
| Session tokens | crypto.randomBytes, SHA-256 hashed at rest, HttpOnly/Secure/SameSite |
| Password hashing | PBKDF2-SHA256, 100k iterations, pepper |
| Tenant isolation | `TenantScopedRepository` - runtime org-scoping guard |
| Rate limiting | Per-auth-endpoint rate limits in D1 |
| Dependency scanning | OSV scanner (weekly), pnpm audit (CI), Dependabot (weekly PRs) |
| Error redaction | Stack traces, SQL, secrets never returned in API responses |

## Dependency Exceptions

See `docs/compliance/DEPENDENCY_POLICY.md`.
