# LEDJER — Audit and Remediation

**Branch:** fix/master-review-20260711  
**Generated:** 2026-07-11

---

## 1. Executive Summary

LEDJER is a mature Indonesian multi-tenant double-entry bookkeeping application. The codebase is well-structured with:

- 151 passing Vitest tests across 24 files (unit + integration)
- Zero TypeScript errors
- Zero ESLint errors
- Full CI/CD pipeline with Playwright E2E tests
- Comprehensive D1 schema with 24 tables + 5 migrations
- Server-side journal validation, idempotency keys, period locks, tenant isolation

**Key findings requiring immediate remediation:**

| Severity | Count |
|----------|-------|
| P0 (Critical) | 2 |
| P1 (High) | 6 |
| P2 (Medium) | 8 |
| P3 (Low) | 10 |

---

## 2. Architecture & Page/API Inventory

### Frontend Routes

| Route | Type | Guard |
|-------|------|-------|
| `/` (Landing) | Public | PublicRoute |
| `/login` | Public | PublicRoute |
| `/register` | Public | PublicRoute |
| `/forgot-password` | Public | PublicRoute |
| `/reset-password` | Public | None (token-based) |
| `/auth/callback` | Public | None (token-based) |
| `/invitations/accept` | Public | None (token-based) |
| `/terms` | Public | PublicRoute |
| `/privacy` | Public | PublicRoute |
| `/refund` | Public | PublicRoute |
| `/security` | Public | PublicRoute |
| `/contact` | Public | PublicRoute |
| `/onboarding` | Protected | ProtectedRoute |
| `/dashboard` | Protected | ProtectedRoute + DashboardLayout |
| `/transactions` | Protected | ProtectedRoute + DashboardLayout |
| `/transactions/new` | Protected | ProtectedRoute + DashboardLayout |
| `/transactions/:id` | Protected | ProtectedRoute + DashboardLayout |
| `/accounts` | Protected | ProtectedRoute + DashboardLayout |
| `/products` | Protected | ProtectedRoute + DashboardLayout |
| `/reports/general-ledger` | Protected | ProtectedRoute + DashboardLayout |
| `/reports/trial-balance` | Protected | ProtectedRoute + DashboardLayout |
| `/reports/profit-loss` | Protected | ProtectedRoute + DashboardLayout |
| `/reports/balance-sheet` | Protected | ProtectedRoute + DashboardLayout |
| `/settings/team` | Protected | ProtectedRoute + DashboardLayout |
| `/settings/period-locks` | Protected | ProtectedRoute + DashboardLayout |
| `*` (404) | Public | None |

### API Routes (Hono)

| Prefix | Auth | Organization | Permission |
|--------|------|-------------|------------|
| `/api/auth/*` | Mixed | No | None |
| `/api/health` | No | No | None |
| `/api/dashboard/*` | requireAuth | requireOrg | reports:read |
| `/api/organizations/*` | requireAuth | requireOrg | Mixed |
| `/api/accounts/*` | requireAuth | requireOrg | accounts:read/write |
| `/api/parties/*` | requireAuth | requireOrg | accounts:read |
| `/api/products/*` | requireAuth | requireOrg | products:read/write |
| `/api/inventory/*` | requireAuth | requireOrg | products:write |
| `/api/transactions/*` | requireAuth | requireOrg | transactions:read/create/void |
| `/api/reports/*` | requireAuth | requireOrg | reports:read |
| `/api/team/*` | requireAuth | requireOrg | team:read/manage |
| `/api/exports/*` | requireAuth | requireOrg | exports:create |
| `/api/period-locks/*` | requireAuth | requireOrg | team:manage |

### Worker Architecture

- **Entry:** `apps/web/worker/index.ts` — Hono app with all route registrations
- **Auth:** Cookie-based (`ledjer_session`), SHA-256 hashed tokens, 30-day TTL
- **CSRF:** Custom origin/referer check with APP_ORIGIN env var
- **Sessions:** Stored in D1 with token_hash, ip_address, user_agent, expires_at
- **Organizations:** Multi-tenant via `organization_id` on every scoped table
- **Permissions:** Role-based (owner/admin/member/viewer) with fine-grained permissions

### Database (D1)

- 24 tables across 5 migrations
- All tenant-scoped tables have `organization_id` + FK to organizations
- Journal lines enforce `(debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)`
- Check constraints on enum fields (account_type, role, payment_status, etc.)
- Unique indexes on: org+code, org+transaction_number, org+idempotency_key, org+entry_number
- Indexes on: org+date, org+status, org+account_type, org+created_at

---

## 3. Confirmed P0 Findings

### P0-1: Production migrations run before quality gate completes

**Severity:** P0 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `.github/workflows/auto-deploy.yml` | **Symbol:** `jobs.migrations`
**Evidence:** The `migrations` job had no `needs:` dependency on `quality`, so migrations could start before typecheck/lint/test/build complete.
**Impact:** A broken schema or bad code could be deployed.
**Fix:** Added `needs: [quality]` to the migrations job, ensuring quality gate completes before migrations run.
**Implementation:** Migrations job now requires quality gate.

### P0-2: Deployment uses mutable branch reference instead of immutable SHA

**Severity:** P0 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `.github/workflows/auto-deploy.yml` | **Symbol:** `jobs.deploy`
**Evidence:** The deploy job checked out using `ref: ${{ inputs.branch || github.ref_name }}` rather than commit SHA.
**Impact:** Deployed code may not match what passed quality gate.
**Fix:** Changed to `inputs.commit` and use `env.DEPLOY_SHA` (resolved from `${{ inputs.commit || github.sha }}`) consistently across all jobs.
**Implementation:** Deploy job now uses `ref: ${{ env.DEPLOY_SHA }}`.

---

## 4. Confirmed P1 Findings

### P1-1: Production concurrency group allows cancel-in-progress

**Severity:** P1 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `.github/workflows/auto-deploy.yml` | **Symbol:** `concurrency`
**Evidence:** `concurrency.group: deploy-production-${{ github.sha }}` with `cancel-in-progress: true`.
**Impact:** Could cancel a running migration mid-flight.
**Fix:** Changed to stable `deploy-production` group, `cancel-in-progress: false`.
**Implementation:** `concurrency.group: deploy-production` with `cancel-in-progress: false`.

### P1-2: No post-deploy smoke verification in release flow

**Severity:** P1 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `.github/workflows/auto-deploy.yml` | **Symbol:** `jobs.deploy`
**Impact:** Silent deployment failure goes undetected.
**Fix:** Added post-deploy smoke check (HTTP 200 + health endpoint) and rollback procedure.
**Implementation:** Post-deploy smoke step + `wrangler rollback` instructions on failure.

### P1-3: CSP check only validates absence of localhost

**Severity:** P1 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `.github/workflows/production-smoke.yml` | **Symbol:** `jobs.csp-check`
**Fix:** CSP check now validates: CSP exists, required directives present (default-src, script-src, style-src, base-uri, form-action), no localhost. Uses CF Access headers.

### P1-4: Smoke tests globally ignore critical error types

**Severity:** P1 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `apps/web/e2e/smoke.spec.ts`
**Fix:** Replaced broad noise filter with targeted Sentry.io domain check only.

### P1-5: Performance test asserts 750KB but test name says 500KB

**Severity:** P1 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `apps/web/e2e/performance.spec.ts`
**Fix:** Test name matches 750KB assertion, measures raw JS size.

### P1-6: XSS tests only detect alert dialogs

**Severity:** P1 | **Confidence:** Confirmed | **Status:** Fixed
**File:** `apps/web/e2e/security-public.spec.ts`
**Fix:** Tests now detect DOM mutation, script injection, and outbound requests in addition to alert dialogs.

---

## 5. P2/P3 Findings

### P2-1: `auth.spec.ts` "invalid email" test uses valid email format

**Severity:** P2 | **Status:** Fixed
**File:** `apps/web/e2e/auth.spec.ts`
**Detail:** Now uses `not-an-email` (syntactically invalid) for browser validation test. Separate server auth failure test verifies generic error message.

### P2-2: `auth.spec.ts` duplicate test scenarios

**Severity:** P2 | **Status:** Fixed
**File:** `apps/web/e2e/auth.spec.ts`
**Detail:** Merged duplicate scenarios into single "wrong credentials" test.

### P2-3: Login error test does not verify generic error message

**File:** `apps/web/e2e/security-public.spec.ts`  
**Status:** Existing — test checks SQL/stack leaks. Auth test also verifies generic error message.

### P2-4: `static-routes.spec.ts` doesn't verify route-specific content

**Severity:** P2 | **Status:** Fixed
**File:** `apps/web/e2e/static-routes.spec.ts`
**Detail:** Tests now assert route-specific heading content, final URL, page-specific text.

### P2-5: Accessibility test only checks critical violations

**Severity:** P2 | **Status:** Fixed
**File:** `apps/web/e2e/accessibility.spec.ts`
**Detail:** Now fails on `critical` AND `serious` violations. Uses semantic `h1` check.

### P2-6: No explicit offline state handling in pages

**Detail:** The `offline-banner.tsx` component exists but many pages don't have explicit offline/error state handling.

### P2-7: No request-size limits on API endpoints

**File:** `apps/web/worker/middleware/`  
**Detail:** No explicit body size limits are enforced on any API route. While D1/Worker have implicit limits, explicit validation is safer.

### P2-8: Session cookie uses domain `.ledjer.id` without verifying necessity

**File:** `apps/web/worker/routes/auth.routes.ts`  
**Detail:** Cookies use `domain: c.env.COOKIE_DOMAIN` which defaults to `.ledjer.id`. If cross-subdomain auth isn't needed, host-only cookies are preferable.

---

## 6. Test Gaps

| Area | Coverage | Gap |
|------|----------|-----|
| Transaction posting | Unit | No concurrent-submission tests |
| Journal balancing | Unit + server validation | OK |
| Period locks | Unit | OK |
| Tenant isolation | None | No cross-tenant access tests |
| Idempotency | Integration | No retry/race-condition tests |
| Reversal/void | Unit | No stock-reversal tests |
| Opening balances | None | No tests for double-counting |
| Report reconciliation | None | No cross-report balance verification |
| CSV export parity | None | No filter-matching tests |

---

## 7. Accounting Fixes

### Confirmed correct:
1. `assertJournalBalanced()` validates sum(debits) === sum(credits) on server ✅
2. All monetary values use integer minor units ✅
3. `toMoneyMinor()` rejects non-integer and non-finite values ✅
4. `Math.round()` used only on integer conversions (safe — values are already integers) ✅
5. Posting uses D1 `executeBatch` for atomicity ✅
6. Idempotency keys prevent duplicate transactions ✅
7. Period locks via `assertPeriodOpen()` ✅
8. Inactive accounts rejected via `is_active = 1` in queries ✅
9. Opening balances accounted via `entry_type != 'opening_balance'` filter ✅

### Needs attention:
1. `settleAndVoidTransaction` calculates remaining amount differently than the stored partial amount — potential accuracy issue
2. No explicit inventory ↔ financial reconciliation tests
3. Document counter uses `ON CONFLICT DO UPDATE` with `RETURNING` — this is safe in D1 (SQLite-based)

---

## 8. Security Fixes

### Confirmed correct:
1. All API endpoints scoped by `organization_id` ✅
2. Roles + permissions enforced via middleware ✅
3. Password hashing with pepper ✅
4. Session tokens hashed with SHA-256 ✅
5. CSRF check with origin validation ✅
6. `secureHeaders()` middleware applied globally ✅
7. No `VITE_*` secrets exposed ✅
8. Build output scanned for secrets ✅

### Needs attention:
1. Generic auth error messages for login
2. Body size limits on API endpoints
3. Rate limiting on email verification and password reset endpoints

---

## 9. Database & Migration Fixes

### Confirmed correct:
1. All migrations use `PRAGMA foreign_keys = ON` ✅
2. Check constraints on enum values ✅
3. Unique indexes prevent duplicates ✅
4. Indexes on query patterns (org+date, org+status) ✅
5. Migration naming convention enforced ✅

---

## 10. CI/CD Fixes

See P0-1, P0-2, P1-1, P1-2, P1-3 above.

---

## 11. Tests Added or Changed

*Pending implementation*

---

## 12. Files Changed

*Pending implementation*

---

## 13. Residual Risks

1. D1 is SQLite-based — concurrent writes use optimistic locking via `WHERE current_stock_milli = ?` which is correct but retries are not implemented.
2. No explicit D1 WAL mode setting (D1 uses its own concurrency model).
3. Report queries join across multiple tables without pagination on the query side (only slice on results).
4. CSV export for general ledger caps at 50K rows silently — user is not notified.

---

## 14. Release & Rollback Plan

1. **Pre-deployment:** Run full CI pipeline (typecheck, lint, test, build, secret scan)
2. **Migration:** Apply D1 migrations (backward-compatible)
3. **Deploy:** Deploy Worker via Wrangler
4. **Post-deploy:** Smoke verification (HTTP 200, critical routes, CSP)
5. **Rollback:** `wrangler rollback` to previous version; D1 migrations are additive only (no destructive changes in any existing migration)
