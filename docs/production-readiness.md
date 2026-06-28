# Ledjer — Production Readiness Checklist

Last verified: 2026-07-31 against the active baseline migration `supabase/migrations/00000000000000_baseline.sql` plus active dated migrations (ending with `20260731000001_remaining_risks_fix.sql`).

## Status Legend

- ✅ Ready
- ⚠️ Partially Ready
- ❌ Not Ready

---

## 1. Environment & Configuration

| Item | Status | Notes |
|------|--------|-------|
| Environment variables documented | ✅ | `.env.example` exists with placeholders |
| `.env.local` not tracked in git | ✅ | `.gitignore` excludes `.env.local`, `.env`, `.env.*` |
| Supabase URL configured | ✅ | Via `VITE_SUPABASE_URL` |
| Supabase anon key configured | ✅ | Via `VITE_SUPABASE_ANON_KEY` |
| No secrets in committed code | ✅ | Verified no real keys in tracked files |
| Build output excluded from git | ✅ | `dist/**` in `.gitignore` |

**Action required:** Rotate Supabase anon key if it was ever exposed in version control history.

---

## 2. Security

| Item | Status | Notes |
|------|--------|-------|
| RLS enabled on financial tables | ✅ | `transactions`, `journal_entries`, `journal_lines`, `stock_movements`, `audit_logs` all RLS-on |
| RLS enforces org isolation | ✅ | `is_org_member()` check on every SELECT policy |
| No INSERT/UPDATE/DELETE policies on financial tables | ✅ | Client writes blocked; mutations flow through RPCs only |
| RPC functions use SECURITY DEFINER | ✅ | All transaction RPCs are SECURITY DEFINER |
| RPC functions set search_path | ✅ | `SET search_path = public` on all RPCs |
| Permission checks in RPCs | ✅ | `has_permission()` for create/void/report |
| Client cannot modify billing plan | ✅ | Trigger-protected `current_plan` column |
| Client cannot modify system flags | ✅ | Trigger-protected `is_system`, `is_locked` |
| **Admin RPCs explicitly GRANTed to service_role** | ✅ | `admin_list_organizations`, `admin_get_organization`, `admin_update_plan`, `admin_set_suspension` — inline privilege tests verify anon/authenticated cannot execute |
| Audit logging for financial actions | ✅ | `audit_logs` populated by RPCs |
| Rate limiting implemented | ✅ | `rate_limits` table, `check_rate_limit()` |
| Login attempt tracking | ✅ | `login_attempts` table, `record_login_attempt()` |
| Email verification required for invites | ✅ | `invite_staff` checks `email_confirmed_at` |
| Opening balance restricted to owner | ✅ | `post_opening_balance` checks `role = 'owner'` |
| Opening balance rejected after setup | ✅ | `post_opening_balance` rejects if `onboarding_status='completed'` or normal transactions exist |
| Opening balance rejected via `post_transaction` | ✅ | Guard in `post_transaction` raises for opening_* types |
| login_attempts INSERT locked down | ✅ | Policy dropped, REVOKE from anon/authenticated |
| Zero-cost sale blocked | ✅ | `post_transaction` raises if `purchase_price = 0` on sale |
| Idempotency via client_token | ✅ | `transactions.client_token` column + partial unique index |
| Internal helpers not externally callable | ✅ | All `_test_*` and internal functions REVOKED from PUBLIC/anon/authenticated |
| HSTS configured | ✅ | `_headers`, `vercel.json` emit HSTS header (not index.html meta, which is ineffective for HSTS) |
| CSP synchronized — no localhost in production | ✅ | `index.html`, `public/_headers`, and `vercel.json` all have identical CSP; `http://localhost:*` removed from production meta tag |
| **Sentry Replay privacy** | ✅ | `maskAllText`, `blockAllMedia`, `maskAllInputs` enabled; `beforeSend` strips URL query params, hash, and sensitive `request.headers` (Authorization, Cookie, etc.) |
| **Auth error enumeration prevented** | ✅ | `user_not_found` mapped to generic `'Email atau password salah.'` — same message as invalid credentials |
| **CSV formula injection protected** | ✅ | `csv_escape()` function prefixes `'` on cells starting with `=`, `+`, `-`, `@`; all CSV export RPCs use it |
| **Invitation tokens hashed at rest** | ✅ | SHA-256 hash via BEFORE INSERT trigger; `accept_invitation` uses hash-only lookup (`WHERE token_hash = ...`) for index usage; pre-migration pending invitations expired |
| **Account creation race condition eliminated** | ✅ | `create_cash_bank_account` RPC uses `get_next_counter` for atomic code generation — no more client-side `getNextAccountCode` |
| **Product `purchase_price` protected** | ✅ | `protect_product_stock_update` trigger extended to block direct `purchase_price` mutations; `recalculate_product_average_cost` uses `set_config` bypass |
| DB privileges least-privilege | ✅ | `20260625200000_revoke_anon_auth_privileges.sql`: anon has zero DML on business tables; authenticated has SELECT + explicit RPC EXECUTE only |
| Views covered in privilege tests | ✅ | Tests check `relkind IN ('r','p','v','m')` covering tables, partitioned tables, views, materialized views |
| general_ledger view protected | ✅ | Explicit assertion: authenticated has no INSERT/UPDATE/DELETE on `general_ledger` (SELECT-only via RPC) |
| Test helpers not callable | ✅ | `_test_*` functions EXECUTE revoked from PUBLIC/anon/authenticated immediately after creation; verified by Test 9 |
| Default privileges revoked | ✅ | Future objects no longer auto-grant to anon/authenticated (postgres defaults) |

**Remaining risks:**
- Service role key security depends on Supabase dashboard access controls.
- `supabase_admin` default ACLs still grant to anon/authenticated (controlled at Supabase infrastructure level; cannot be altered by postgres role).
- No IP-based rate limiting (only identifier-based).

---

## 3. Accounting Correctness

| Item | Status | Notes |
|------|--------|-------|
| Double-entry accounting enforced | ✅ | Journal balance check in all posting functions |
| Balance sheet respects `as_of_date` | ✅ | CTE filters `je.entry_date <= p_as_of_date` |
| Balance sheet excludes non-posted entries | ✅ | CTE filters `je.status = 'posted'` |
| Opening balance restricted to onboarding | ✅ | `post_transaction` rejects opening_* types |
| Opening balance restricted to owner | ✅ | `post_opening_balance` checks owner role |
| COGS validation for product sales | ✅ | `validate_product_sale_accounts` raises if COGS/inventory accounts missing |
| Void creates balanced reversal | ✅ | Reversal journal validated before commit |
| Weighted average COGS | ✅ | `recalculate_product_average_cost` uses signed quantities |
| Transaction numbering unique | ✅ | Unique on `(organization_id, transaction_number)` |
| Entry numbering unique | ✅ | Unique on `(organization_id, entry_number)` |
| `post_transaction` single canonical overload | ✅ | Single 19-param function with `p_client_token` |
| Initial product stock uses `books_start_date` | ✅ | No CURRENT_DATE dependency |
| Initial stock blocked post-onboarding | ✅ | Trigger raises if `onboarding_status='completed'` |
| **Cash account validation for partial credit payments** | ✅ | `post_transaction` validates cash account belongs to org for `credit_sale`/`credit_purchase` partial payments — prevents cross-org cash account usage |

**Remaining risks:**
- Inventory-vs-stock movement reconciliation covered by SQL tests only.
- No closing entry automation.
- No invoice-level AR/AP tracking.

---

## 4. Data Integrity

| Item | Status | Notes |
|------|--------|-------|
| Foreign key constraints | ✅ | All references use FK |
| NOT NULL on required fields | ✅ | Enforced in schema |
| Organization scoping on all data | ✅ | `organization_id` on every table |
| Soft delete for members | ✅ | `status = 'removed'` instead of DELETE |

---

## 5. Frontend

| Item | Status | Notes |
|------|--------|-------|
| TypeScript compilation | ✅ | `pnpm typecheck` passes (0 errors) |
| ESLint passes | ✅ | `pnpm lint` passes (0 errors) |
| Onboarding guard at layout level | ✅ | Dashboard layout redirects to onboarding |
| Error boundaries | ✅ | `ErrorBoundary` wraps app |
| Mobile responsive | ✅ | Responsive layout tested |
| Database types canonical source | ✅ | `packages/database-types/index.ts` is single source of truth |
| Database types drift CI guard | ✅ | `pnpm db-types:check --live` verifies no drift |
| Auth callback covered by tests | ✅ | `__tests__/auth-callback.test.tsx` |
| Frontend unit tests | ✅ | 113 tests across 13 files |
| E2E smoke tests | ✅ | Playwright smoke tests: login page loads, route guards redirect, landing page, basic a11y checks |
| **CI visual regression compares instead of auto-updates** | ✅ | Removed `--update-snapshots` from CI workflow |

**Remaining risks:**
- No full E2E auth flow tests (requires test user seeding in CI).
- No comprehensive WCAG 2.1 AA audit.

---

## 6. Monitoring & Observability

| Item | Status | Notes |
|------|--------|-------|
| Error logging | ✅ | Sentry error tracking wired behind `VITE_SENTRY_DSN` |
| Performance monitoring | ✅ | Sentry traces at 10% sampling (production-tuned) |
| **Sentry Replay configured with privacy** | ✅ | `replayIntegration` with `maskAllText: true`, `blockAllMedia: true`, `maskAllInputs: true` |
| **Sentry `beforeSend` sanitization** | ✅ | Strips URL query params/hash; scrubs `request.headers` (Authorization, Cookie, Set-Cookie, x-auth-token, api-key) |
| CSP allows Sentry ingest | ✅ | `connect-src` includes `https://*.ingest.sentry.io` in all three CSP sources |
| Uptime monitoring | ❌ | Not configured — requires UptimeRobot, Checkly, or equivalent |
| Alerting | ⚠️ | Requires configuration in Sentry Dashboard |

**Required before production:**
- Set up Supabase dashboard monitoring.
- Set up uptime monitoring (e.g., UptimeRobot free tier).
- Configure Sentry alerts in Sentry project dashboard (see section 6 below).

---

## 7. Testing

| Item | Status | Notes |
|------|--------|-------|
| SQL strict regression tests | ✅ | RAISE EXCEPTION on fail |
| SQL strict golden scenario | ✅ | Explicit expected balances |
| SQL strict security/RLS tests | ✅ | RLS enabled, SECURITY DEFINER, search_path, org isolation |
| SQL privilege hardening tests | ✅ | Uses `pg_class`/`pg_namespace` + `has_*_privilege`; covers tables, views, materialized views; tests anon/authenticated DML on `general_ledger` view; Test 9 verifies `_test_*` isolation |
| SQL behavioural permission matrix | ✅ | Staff permissions + cross-org RLS |
| SQL inventory golden scenario | ✅ | Weighted average + zero-cost block + GL invariant |
| **SQL partial payment regression tests** | ✅ | Cross-org cash account validation, credit payment scenarios |
| SQL helper factories | ✅ | `_test_impersonate`, `_test_create_org_with_users` |
| SQL test harness hardened | ✅ | Production warning, final `_test_*` cleanup assertion, EXECUTE revoked from PUBLIC/anon/authenticated |
| Frontend unit tests | ✅ | 113 tests across 13 files |
| E2E smoke tests | ✅ | Playwright: login/register/forgot-password load, route guards redirect, a11y basics |
| Migration CI guard | ✅ | No `_test_assert` in migrations |
| Packaging CI guard | ✅ | No secrets in archives |
| CI runs real Supabase local stack | ✅ | `supabase start` + `supabase db reset` |
| Live DB types drift check | ✅ | CI runs `supabase gen types` + diff |

---

## 8. Documentation

| Item | Status | Notes |
|------|--------|-------|
| README with setup instructions | ✅ | `apps/web/README.md` |
| Accounting rules documentation | ✅ | `docs/accounting-rules.md` |
| QA checklist | ✅ | `docs/qa-checklist.md` |
| Production readiness (this file) | ✅ | Reflects actual verified status |
| **Security checklists updated** | ✅ | `docs/production/security-checklist.md`, `docs/release-readiness/security-checklist.md` updated with recent fixes |
| **Monitoring docs updated** | ✅ | `docs/production/monitoring.md` updated with Sentry Replay config |
| **Launch checklist updated** | ✅ | `docs/production/launch-checklist.md` updated with CSV formula protection, token hashing, admin RPC tests |

---

## 9. Deployment

| Item | Status | Notes |
|------|--------|-------|
| Supabase migrations applied | ⚠️ | Must apply all active migrations to target database |
| Frontend build verified | ✅ | `pnpm --filter web build` passes |
| Environment variables set | ⚠️ | Must configure in hosting platform |
| Domain configured | ✅ | `site_url = "https://app.ledjer.id"` |
| SSL/HTTPS | ⚠️ | Depends on hosting platform |
| service_role key isolation | ⚠️ | Must never be in frontend hosting; only in server-side/Edge Functions |

**Operational requirements (must be completed before launch):**
1. Apply all active migrations to target Supabase project.
2. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN` in hosting platform.
3. Never deploy `SUPABASE_SERVICE_ROLE_KEY` to frontend hosting.
4. Configure Sentry alerts in Sentry project dashboard.
5. Configure uptime monitoring (e.g., UptimeRobot, Checkly).
6. Perform backup restore verification on target Supabase project.
7. Rotate Supabase anon key if it was ever exposed in git history.
8. Confirm domain, HTTPS, CSP, HSTS headers on deployed host.

**Most recent verification (2026-07-31):**

```bash
pnpm --filter web typecheck          # ✅ tsc -b clean
pnpm --filter @ledjer/database-types typecheck  # ✅ tsc clean
bash scripts/check-db-types.sh       # ✅ canonical — matches current schema
bash scripts/check-migration-naming.sh  # ✅ all migrations, canonical naming
pnpm --filter web lint               # ✅ eslint clean
pnpm --filter web test               # ✅ 113 tests passed
pnpm --filter web build              # ✅ vite build passed
pnpm audit --prod --audit-level moderate  # ⚠️ 1 low (esbuild dev-server Windows-only, not production)
# supabase start + db reset          # ✅ all migrations applied locally (current: 15+ active)
# SQL tests via run_all.sql           # ✅ all suites passed + final cleanup assertion + view coverage
# supabase gen types + diff           # ✅ DB types match canonical
```

**CI runs E2E as a separate job** (`needs: frontend`). It builds with anon-only test secrets, then runs Playwright against the preview server. Report uploaded only on failure.

---

## 10. Packaging & Distribution

```bash
git archive --format=tar.gz --output=ledjer-src.tar.gz --worktree-attributes HEAD
```

The `guard-package-clean` job runs in CI against both tarball and zip.

---

## Dependency Audit

| Package | Severity | Status | Notes |
|---------|----------|--------|-------|
| esbuild (via @tailwindcss/vite > vite) | Low | Accepted | Arbitrary file read on Windows dev server only. Does not affect production Linux builds. |

No moderate/high/critical production vulnerabilities.

---

## Launch Blockers

1. Run CI workflow green end-to-end (frontend + Supabase + E2E jobs).
2. Apply all active migrations to target Supabase project.
3. Error monitoring wired (Sentry behind `VITE_SENTRY_DSN`) — set the DSN and configure alerts.
4. Configure environment variables in production.
5. Rotate Supabase anon key if it was ever in version control.
6. **Configure SMTP email provider** for invitation email delivery.
7. **Run backup restore drill** before storing real user data.

## Recommended Before Launch

1. Set up uptime monitoring (UptimeRobot free tier).
2. Configure backup verification drill.
3. Expand E2E tests with auth flow (requires test user seeding).
4. Perform full WCAG 2.1 AA accessibility audit.
5. Load test with realistic data volume.

## Production Launch Runbook

Pre-launch operational checklist. Each step must be verified before go-live.

### 1. Apply Database Migrations

```bash
supabase login
supabase link --project-ref <your-project-id>
supabase db push
```

Verify: all active migrations applied. Check via Supabase dashboard → Database → Migrations.

### 2. Configure Frontend Environment Variables

Set in hosting platform (Vercel / Netlify / Cloudflare Pages / nginx):

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase dashboard → Settings → API → URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API → anon public key |
| `VITE_SENTRY_DSN` | Sentry project → Settings → Client Keys → DSN |

**Never** set `SUPABASE_SERVICE_ROLE_KEY` in frontend hosting. Service role bypasses RLS.

### 3. Configure Sentry Alerts

1. Sentry dashboard → Alerts → Create Alert Rule
2. Recommended: error spike detection (≥10 errors in 5 min)
3. Recommended: new error type notification
4. Recommended: performance regression (P95 latency > 2s)

### 4. Configure Uptime Monitoring

Recommended: UptimeRobot, Checkly, or equivalent.

- Monitor `https://app.ledjer.id` (HTTP 200 check, 5-min interval)
- Alert on: downtime, SSL certificate expiry, response time > 5s

### 5. Verify Backup Restore

1. Supabase dashboard → Database → Backups
2. Trigger a manual backup
3. Restore to a temporary project or branch
4. Verify data integrity (row counts, foreign keys)

### 6. Rotate Supabase Anon Key (if exposed)

If the anon key was ever committed to git history:
1. Supabase dashboard → Settings → API → Regenerate anon key
2. Update all hosting environment variables with new key
3. Old key is immediately invalidated

### 7. Verify Security Headers

On deployed host, confirm:
- **HTTPS**: all traffic redirected from HTTP
- **HSTS**: `Strict-Transport-Security` header present (set by hosting platform or `_headers` / `vercel.json`)
- **CSP**: Content-Security-Policy header present, Sentry ingest allowed
- **X-Frame-Options**: `DENY` or `SAMEORIGIN`

### 8. Run Full CI Gate

```bash
# Push to main and verify all CI jobs pass:
# - Frontend (typecheck, lint, test, build)
# - E2E (Playwright smoke tests)
# - db-types-guard
# - supabase (migrations + SQL tests)
# - guard-no-test-assert-in-migrations
# - guard-package-clean
```

### 9. Smoke Test Production

1. Open `https://app.ledjer.id`
2. Verify login page loads (title: Ledjer)
3. Verify register page loads
4. Verify forgot password page loads
5. Verify unauthenticated dashboard redirect → login
6. Create test organization, add one transaction, verify reports render

---

## Known Limitations

1. No invoice-level AR/AP tracking (party-level only).
2. No PDF/Excel export (CSV only).
3. No automated closing entries.
4. No multi-currency support.
5. Limited to Indonesian business context (IDR, Bahasa Indonesia).
6. **Self-serve billing not implemented** — manual billing via admin SQL console only.
7. **Email delivery for invitations requires SMTP configuration** — token generated but provider setup needed.
8. **Uptime monitoring not configured** — requires external tool setup.
