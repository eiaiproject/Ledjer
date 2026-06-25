# Ledjer — Production Readiness Checklist

Last verified: 2026-06-25 against the active baseline migration `supabase/migrations/00000000000000_baseline.sql` plus 5 active dated migrations (ending with `20260625200000_revoke_anon_auth_privileges.sql`).

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
| HSTS configured | ✅ | `_headers`, `vercel.json`, and `index.html` all emit HSTS |
| CSP synchronized | ✅ | `index.html`, `public/_headers`, and `vercel.json` all have identical CSP including Sentry ingest |
| **DB privileges least-privilege** | ✅ | `20260625200000_revoke_anon_auth_privileges.sql`: anon has zero DML on business tables; authenticated has SELECT + explicit RPC EXECUTE only |
| **Test helpers not callable** | ✅ | `_test_*` functions EXECUTE revoked from PUBLIC/anon/authenticated immediately after creation |
| **Default privileges revoked** | ✅ | Future objects no longer auto-grant to anon/authenticated (postgres defaults) |

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

**Remaining risks:**
- No automated E2E tests.
- No accessibility audit (WCAG 2.1 AA).

---

## 6. Monitoring & Observability

| Item | Status | Notes |
|------|--------|-------|
| Error logging | ✅ | Sentry error tracking wired behind `VITE_SENTRY_DSN` |
| Performance monitoring | ✅ | Sentry performance monitoring configured |
| CSP allows Sentry ingest | ✅ | `connect-src` includes `https://*.ingest.sentry.io` in all three CSP sources |
| Uptime monitoring | ❌ | Not configured |
| Alerting | ⚠️ | Requires configuration in Sentry Dashboard |

**Required before production:**
- Set up Supabase dashboard monitoring.
- Set up uptime monitoring.
- Configure Sentry alerts in Sentry project dashboard.

---

## 7. Testing

| Item | Status | Notes |
|------|--------|-------|
| SQL strict regression tests | ✅ | RAISE EXCEPTION on fail |
| SQL strict golden scenario | ✅ | Explicit expected balances |
| SQL strict security/RLS tests | ✅ | RLS enabled, SECURITY DEFINER, search_path, org isolation |
| SQL privilege hardening tests | ✅ | Uses `pg_class`/`pg_namespace` + `has_*_privilege`; tests anon DML block, RPC access, default ACLs |
| SQL behavioural permission matrix | ✅ | Staff permissions + cross-org RLS |
| SQL inventory golden scenario | ✅ | Weighted average + zero-cost block + GL invariant |
| SQL helper factories | ✅ | `_test_impersonate`, `_test_create_org_with_users` |
| SQL test harness hardened | ✅ | Production warning, final `_test_*` cleanup assertion, EXECUTE revoked from PUBLIC/anon/authenticated |
| Frontend unit tests | ✅ | 113 tests across 13 files |
| Migration CI guard | ✅ | No `_test_assert` in migrations |
| Packaging CI guard | ✅ | No secrets in archives |
| CI runs real Supabase local stack | ✅ | `supabase start` + `supabase db reset` |
| **Live DB types drift check** | ✅ | CI runs `supabase gen types` + diff |

---

## 8. Documentation

| Item | Status | Notes |
|------|--------|-------|
| README with setup instructions | ✅ | `apps/web/README.md` |
| Accounting rules documentation | ✅ | `docs/accounting-rules.md` |
| QA checklist | ✅ | `docs/qa-checklist.md` |
| Production readiness (this file) | ✅ | Reflects actual verified status |

---

## 9. Deployment

| Item | Status | Notes |
|------|--------|-------|
| Supabase migrations applied | ⚠️ | Must apply all 6 active migrations to target database |
| Frontend build verified | ✅ | `pnpm --filter web build` passes |
| Environment variables set | ⚠️ | Must configure in hosting platform |
| Domain configured | ✅ | `site_url = "https://app.ledjer.id"` |
| SSL/HTTPS | ⚠️ | Depends on hosting platform |

**Most recent verification (2026-06-25):**

```bash
pnpm --filter web typecheck          # ✅ tsc -b clean
pnpm db-types:check --live           # ✅ no drift (1625 lines)
bash scripts/check-migration-naming.sh  # ✅ 6 migrations, canonical
pnpm --filter web lint               # ✅ eslint clean
pnpm --filter web test               # ✅ 113 tests passed
pnpm --filter web build              # ✅ vite build passed
pnpm audit                           # ⚠️ 1 low (esbuild dev-server Windows-only)
# SQL tests via docker exec psql     # ✅ all suites passed + final cleanup assertion
```

---

## 10. Packaging & Distribution

```bash
git archive --format=tar.gz --output=ledjer-src.tar.gz --worktree-attributes HEAD
```

The `guard-package-clean` job runs in CI against both tarball and zip.

---

## Launch Blockers

1. Run CI workflow green end-to-end (frontend + Supabase jobs).
2. Apply all 6 active migrations (baseline + 5 dated).
3. Error monitoring wired (Sentry behind `VITE_SENTRY_DSN`) — set the DSN and configure alerts.
4. Configure environment variables in production.
5. Rotate Supabase anon key if it was ever in version control.

## Recommended Before Launch

1. Set up uptime monitoring.
2. Configure backup verification.
3. Add basic E2E tests for critical paths.
4. Perform accessibility audit.
5. Load test with realistic data volume.

## Known Limitations

1. No invoice-level AR/AP tracking (party-level only).
2. No report export (CSV/PDF).
3. No automated closing entries.
4. No multi-currency support.
5. Limited to Indonesian business context (IDR, Bahasa Indonesia).
