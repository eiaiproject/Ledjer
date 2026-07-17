# Changelog

All notable changes to Ledjer are documented here.

## [Unreleased]

### Added
- OSV vulnerability scanner (CI weekly workflow)
- pnpm audit in CI quality gate
- Dependabot config (weekly npm updates)
- CycloneDX SBOM + THIRD_PARTY_NOTICES.md
- Dependency security policy
- Auth security tests (14 tests: token generation, password hashing, session)
- CSRF E2E tests (6 tests) + documentation
- Permission matrix documentation
- `TenantScopedRepository` — runtime org-scoping guard
- Tenant isolation tests (12 unit + E2E) + architecture doc
- SQL injection + error redaction tests
- Hardened CSP (object-src 'none', frame-ancestors 'none')
- Security header E2E tests
- Accounting invariant tests (18 tests: journal balance, WAC, trial balance, balance sheet)
- Export row cap (MAX_EXPORT_ROWS = 50,000)
- OpenAPI 3.1 spec + versioning migration plan
- Structured JSON request logging
- Monitoring docs + incident response runbook
- Deployment docs (production + staging setup)
- Backup script (D1 → R2 via wrangler CLI)
- Backup/restore documentation
- R2 bucket binding in wrangler config
- Compliance docs (data retention, subprocessors, privacy engineering, DSR runbook)
- Product instrumentation plan
- Staging environment config in wrangler.jsonc
- k6 load test scripts (8 scenarios)
- Performance baseline documentation
- Test seeded fixtures (multi-org, multi-role)
- Coverage thresholds (lines 80%, branches 75%)
- Health + readiness API endpoints
- In-memory request metrics middleware
- SECURITY.md, CODEOWNERS, ADR records

### Fixed
- Missing `loadCurrentOrganization()` in audit-logs routes
- Placeholder assertions in golden-scenarios.test.ts
- `accounts.spec.ts` data-testid mismatch
- CSP missing `frame-ancestors 'none'` and `object-src 'none'`
- Production `_headers` CSP missing `object-src 'none'`
- E2E CSRF tests brittle for dev vs production mode
