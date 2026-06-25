# Ledjer — Production Readiness Checklist

Last verified: 2026-06-25 against the active baseline migration `supabase/migrations/00000000000000_baseline.sql` plus 4 active dated migrations.

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
| **No INSERT/UPDATE/DELETE policies on financial tables** | ✅ | Phase 3 hardening — `20260726_000000_harden_rls_and_reject_opening_balances.sql` |
| RPC functions use SECURITY DEFINER | ✅ | All transaction RPCs are SECURITY DEFINER |
| RPC functions set search_path | ✅ | `SET search_path = public` on all RPCs (CI test `security_rls_tests.sql` TEST 3b fails if any SECURITY DEFINER function is missing it) |
| Permission checks in RPCs | ✅ | `has_permission()` for create/void/report |
| Client cannot modify billing plan | ✅ | Trigger-protected `current_plan` column |
| Client cannot modify system flags | ✅ | Trigger-protected `is_system`, `is_locked` |
| Audit logging for financial actions | ✅ | `audit_logs` populated by RPCs |
| Rate limiting implemented | ✅ | `rate_limits` table, `check_rate_limit()` |
| Login attempt tracking | ✅ | `login_attempts` table, `record_login_attempt()` |
| Email verification required for invites | ✅ | `invite_staff` checks `email_confirmed_at` |
| Opening balance restricted to owner | ✅ | `post_opening_balance` checks `role = 'owner'` |
| Opening balance rejected after setup | ✅ | `post_opening_balance` rejects if `onboarding_status='completed'` or normal transactions exist |
| **Opening balance rejected via `post_transaction`** | ✅ | Guard added in `20260726_000000_harden_rls_and_reject_opening_balances.sql` |
| **login_attempts INSERT locked down** | ✅ | `20260625184100_master_induk_fixes.sql`: policy dropped, REVOKE from anon/authenticated |
| **Zero-cost sale blocked** | ✅ | `post_transaction` raises if `purchase_price = 0` on sale |
| **Idempotency via client_token** | ✅ | `transactions.client_token` column + partial unique index; RPC returns existing result on duplicate token |
| **Dead `post_transaction_impl_20260702` removed** | ✅ | DROP FUNCTION in `20260625184100_master_induk_fixes.sql` |
| Internal helpers not externally callable | ✅ | `validate_product_sale_accounts`, `recalculate_product_average_cost`, `record_stock_movement` are REVOKED from anon/authenticated |
| HSTS configured | ✅ | `apps/web/public/_headers` and `apps/web/vercel.json` both emit `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` |
| CSP scoped consistently | ✅ | `apps/web/public/_headers` and `apps/web/vercel.json` must mirror the exact same CSP value; update both in the same commit |

**Remaining risks:**
- Service role key security depends on Supabase dashboard access controls.
- No IP-based rate limiting (only identifier-based).

---

## 3. Accounting Correctness

| Item | Status | Notes |
|------|--------|-------|
| Double-entry accounting enforced | ✅ | Journal balance check in all posting functions |
| Balance sheet uses CTE pre-filter | ✅ | `20260722_100000_comprehensive_priority_fixes.sql` |
| Balance sheet respects `as_of_date` | ✅ | CTE filters `je.entry_date <= p_as_of_date` |
| Balance sheet excludes non-posted entries | ✅ | CTE filters `je.status = 'posted'` |
| Opening balance restricted to onboarding | ✅ | `post_transaction` rejects opening_* types |
| Opening balance restricted to owner | ✅ | `post_opening_balance` checks owner role |
| COGS validation for product sales | ✅ | `validate_product_sale_accounts` raises if COGS/inventory accounts missing |
| Void creates balanced reversal | ✅ | Reversal journal validated before commit |
| **Weighted average COGS** — purchase, purchase-void, sale, sale-void | ✅ | `recalculate_product_average_cost` uses signed quantities (Phase 5 fix) |
| Transaction numbering unique | ✅ | Unique on `(organization_id, transaction_number)` |
| Entry numbering unique | ✅ | Unique on `(organization_id, entry_number)` |
| `post_transaction` single canonical overload | ✅ | All overloads dropped, single 19-param function with `p_client_token` and server-side `p_party_name` resolution |
| `p_debit_account_id` in signature | ✅ | Matches frontend TypeScript types and RPC calls |
| **Initial product stock uses `books_start_date`** | ✅ | `record_initial_product_stock` no longer uses `CURRENT_DATE` (Phase 6) |
| **Initial stock blocked post-onboarding** | ✅ | Trigger raises if `onboarding_status='completed'` and `current_stock > 0` |

**Remaining risks:**
- Inventory-vs-stock movement reconciliation is covered by SQL tests; it is not enforced by a runtime constraint/trigger.
- No closing entry automation (year-end retained earnings transfer).
- No invoice-level AR/AP tracking.

---

## 4. Data Integrity

| Item | Status | Notes |
|------|--------|-------|
| Foreign key constraints | ✅ | All references use FK |
| NOT NULL on required fields | ✅ | Enforced in schema |
| Payment status enum | ✅ | `payment_status` type |
| Journal entry type enum | ✅ | `journal_entry_type` type |
| Organization scoping on all data | ✅ | `organization_id` on every table |
| Soft delete for members | ✅ | `status = 'removed'` instead of DELETE |

**Remaining risks:**
- No database-level backup automation beyond Supabase defaults.
- No point-in-time recovery configured.

---

## 5. Frontend

| Item | Status | Notes |
|------|--------|-------|
| TypeScript compilation | ✅ | `pnpm typecheck` passes (tsc -b clean, 0 errors) |
| ESLint passes | ✅ | `pnpm lint` passes (0 warnings) |
| Onboarding guard at layout level | ✅ | Dashboard layout redirects to onboarding |
| Transaction detail accessible to staff | ✅ | Journal lines gated by RLS |
| Search input sanitized | ✅ | Special characters escaped in PostgREST queries |
| Error boundaries | ✅ | `ErrorBoundary` wraps app |
| Loading states | ✅ | Spinners for async operations |
| Mobile responsive | ✅ | Responsive layout tested |
| **Transaction-type constants split** | ✅ | `GENERAL_TRANSACTION_TYPE_LABELS` for UI, `OPENING_…` and `ALL_…` for history |
| **Database types canonical source** | ✅ | Single source of truth in `packages/database-types/index.ts`; legacy `apps/web/src/lib/database-types.ts` is a thin `@deprecated` re-export shim |
| **Database types drift CI guard** | ✅ | `pnpm db-types:check` + CI `db-types-guard` job fails if shim or canonical package is missing/divergent |
| **Auth callback covered by tests** | ✅ | `__tests__/auth-callback.test.tsx` (8 tests) |
| **Auth recovery redirects to `/reset-password`** | ✅ | New `apps/web/src/pages/reset-password.tsx` page; recovery email links no longer land on unrelated team settings |
| **Direct financial write tests not false-green** | ✅ | `accounting_regression_tests.sql` T8 inserts a fully-valid row and asserts failure is RLS, not NOT NULL/FK/check |
| **`pay_payable` direction tested behaviourally** | ✅ | New `supabase/tests/payable_behavior_tests.sql` |
| **Opening balance guard tested behaviourally** | ✅ | `supabase/tests/opening_balance_guard_tests.sql` — incl. PART E: opening AR/AP/equity post balanced journals and balance sheet ties out |
| **Master fix regression tests** | ✅ | `supabase/tests/master_fix_regression_tests.sql` — login_attempts INSERT blocked, zero-cost sale blocked, post/void idempotency dedup, pay_payable direction |
| **Moving-average + zero-cost inventory tested** | ✅ | `supabase/tests/inventory_golden_tests.sql` — sell→rebuy moving avg = 200 (not cumulative 150), zero-cost sale blocked, Inventory-GL invariant |
| **Staff permissions + cross-org RLS tested behaviourally** | ✅ | New `supabase/tests/permission_matrix_tests.sql` |

**Remaining risks:**
- No automated E2E tests.
- No accessibility audit (WCAG 2.1 AA).

---

## 6. Performance

| Item | Status | Notes |
|------|--------|-------|
| Database indexes | ✅ | Indexes on `organization_id`, `entry_date`, etc. |
| Query optimization | ⚠️ | Some queries may need EXPLAIN analysis |
| Lazy loading | ✅ | Route-level code splitting via `React.lazy` |
| Image optimization | ✅ | SVG logos only |

**Remaining risks:**
- No CDN configuration documented.
- No caching strategy for reports.

---

## 7. Monitoring & Observability

| Item | Status | Notes |
|------|--------|-------|
| Error logging | ✅ | Console errors & Sentry error tracking wired behind `VITE_SENTRY_DSN` |
| Performance monitoring | ✅ | Sentry performance monitoring configured |
| Uptime monitoring | ❌ | Not configured |
| Alerting | ⚠️ | Enabled through Sentry alerting (needs configuration in Sentry Dashboard) |

**Required before production:**
- Set up Supabase dashboard monitoring.
- Set up uptime monitoring.
- Configure Sentry alerts in Sentry project dashboard.

---

## 8. Testing

| Item | Status | Notes |
|------|--------|-------|
| SQL strict regression tests | ✅ | `supabase/tests/accounting_regression_tests.sql` (RAISE EXCEPTION on fail) |
| SQL strict golden scenario | ✅ | `supabase/tests/golden_scenario_tests.sql` (explicit expected balances) |
| SQL strict P0 fix tests | ✅ | `supabase/tests/p0_critical_fix_tests.sql` |
| SQL strict security/RLS tests | ✅ | `supabase/tests/security_rls_tests.sql` (now also asserts every SECURITY DEFINER function declares `SET search_path`) |
| **SQL strict inventory golden scenario** | ✅ | `supabase/tests/inventory_golden_tests.sql` (weighted average + sale/void + oversell + inventory GL/stock movement value invariant) |
| **SQL behavioural pay_payable direction** | ✅ | `supabase/tests/payable_behavior_tests.sql` (PB1–PB16) |
| **SQL behavioural opening-balance guard** | ✅ | `supabase/tests/opening_balance_guard_tests.sql` (OG.A1–OG.D1, OG.C2) |
| **SQL behavioural permission matrix + cross-org RLS** | ✅ | `supabase/tests/permission_matrix_tests.sql` (PM1.1–PM6.3) |
| **SQL helper factories** | ✅ | `_test_impersonate`, `_test_create_org_with_users` in `_test_helpers.sql` |
| **Direct INSERT test not false-green** | ✅ | T8 supplies every required column and asserts failure is RLS, not NOT NULL / FK |
| Frontend unit tests | ✅ | `apps/web/src/__tests__/` — 113 tests across 13 files (auth-callback, auth-provider, forgot-password, login, password-recovery-flow, reset-password, rpc-args-contract, smoke, transaction-helpers, transactions, transaction-usage, query-keys, errors) |
| Auth-callback integration tests | ✅ | `auth-callback.test.tsx` covers code exchange, token_hash, invalid/expired, resend, recovery → `/reset-password` |
| Migration CI guard | ✅ | `.github/workflows/ci.yml` fails if any migration references `_test_assert` |
| **Packaging CI guard** | ✅ | `guard-package-clean` job runs `scripts/check-package-clean.sh` against `git archive` tarball and `git ls-files` zip |
| **CI runs real Supabase local stack** | ✅ | `supabase start` + `supabase db reset` against the local Supabase Postgres (has `auth` schema, `auth.users`, `auth.uid()`, `anon` / `authenticated` / `service_role`) |
| **get_monthly_usage RPC hardened** | ✅ | Explicit REVOKE from PUBLIC/anon, GRANT to authenticated; behavioral cross-org test |
| Integration tests | ❌ | Full integration requires running Supabase locally (out of scope here) |
| E2E tests | ❌ | Not implemented |

**Required before production:**
- Run SQL tests against production-equivalent database in CI (workflow is in place; runs on every push).

---

## 9. Documentation

| Item | Status | Notes |
|------|--------|-------|
| README with setup instructions | ✅ | `apps/web/README.md` |
| Engineering report (latest) | ✅ | `docs/engineering-report-20260727.md` |
| Accounting rules documentation | ✅ | `docs/accounting-rules.md` |
| QA checklist | ✅ | `docs/qa-checklist.md` |
| API documentation | ⚠️ | RPC functions documented in code comments |
| Deployment guide | ⚠️ | See "Packaging" below for current distribution method |

---

## 10. Deployment

| Item | Status | Notes |
|------|--------|-------|
| Supabase migrations applied | ⚠️ | Must apply active baseline `00000000000000_baseline.sql` to the target database |
| Frontend build verified | ✅ | `pnpm --filter web build` passes |
| Environment variables set | ⚠️ | Must configure in hosting platform (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_SENTRY_DSN`) |
| Domain configured | ✅ | `supabase/config.toml` uses `site_url = "https://app.ledjer.id"` and whitelists `https://app.ledjer.id/auth/callback`; local dev URLs remain whitelisted |
| SSL/HTTPS | ⚠️ | Depends on hosting platform |

**Most recent verification (2026-06-25):**

The following commands were actually executed:

```bash
pnpm --filter web typecheck          # ✅ tsc -b clean, 0 errors
pnpm db-types:check                  # ✅ canonical DB types + shim guard passed (1634 lines)
bash scripts/check-migration-naming.sh
                                    # ✅ 5 active migrations, canonical, strictly increasing
pnpm --filter web lint               # ✅ eslint clean, 0 errors
pnpm --filter web test               # ✅ 113 tests passed (13 files)
pnpm --filter web build              # ✅ vite production build passed
if rg -n "_test_assert|_test_fail|_test_impersonate|_test_cleanup|_test_create" supabase/migrations --glob '!archive/**'; then exit 1; else true; fi
                                    # ✅ no test helper leak in migrations
supabase db reset --workdir . --no-seed
docker exec -w /tmp/ledjer supabase_db_Ledjer \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f supabase/tests/run_all.sql      # ✅ all SQL suites passed
```

The host machine did not have a native `psql` binary, so the SQL runner was executed with `psql` inside the local Supabase Postgres container after copying `supabase/tests` into `/tmp/ledjer`.

---

## 11. Packaging & Distribution

Use `git archive` or `git ls-files` to create the source tarball/zip so the
exclusions in `.gitignore` are honored automatically. **This is the recommended
distribution method.**

```bash
# Produce a clean source tarball (recommended)
git archive --format=tar.gz \
  --output=ledjer-src.tar.gz \
  --worktree-attributes \
  HEAD

# Produce a clean source zip (alternative)
git ls-files | zip -@ ledjer-src.zip
```

The following paths are excluded from the archive by `.gitignore` (verified
via `git ls-files` and `git archive`):

| Path | Reason |
|------|--------|
| `.git` | VCS metadata |
| `node_modules`, `**/node_modules` | Heavy, reproducible per-target |
| `dist`, `**/dist` | Build output (regenerate with `pnpm build`) |
| `.env`, `.env.local`, `.env.*` (except `.env.example`) | Secrets |
| `.DS_Store`, `__MACOSX` | OS / archive metadata |
| `supabase/.temp`, `supabase/.branches`, `supabase/.env` | Local Supabase artifacts |
| `.turbo`, `.eslintcache`, `.vite`, `coverage` | Tooling caches |
| `.vscode`, `.idea` | IDE config |
| `*.log` | Logs |

### Local packaging guard

Run `./scripts/check-package-clean.sh` (with or without a tarball/zip argument)
before publishing. It inspects either the supplied archive or the current
`git ls-files` output and fails if any forbidden path is present.

```bash
./scripts/check-package-clean.sh                       # inspect git ls-files
./scripts/check-package-clean.sh ledjer-src.tar.gz     # inspect a tarball
./scripts/check-package-clean.sh ledjer-src.zip        # inspect a zip
```

This same guard runs in CI as the `guard-package-clean` job.

**DO NOT** commit a `.zip` containing `node_modules`, `.env.local`, or `dist`.
Always regenerate the archive from a clean checkout.

---

## Launch Blockers

1. Run CI workflow green end-to-end (frontend + Supabase jobs).
2. Apply all active migrations (baseline + the 4 dated migrations, ending with `20260625184100_master_induk_fixes.sql`).
3. Error monitoring wired (Sentry behind `VITE_SENTRY_DSN`) — set the DSN and configure alerts in the Sentry dashboard.
4. Configure environment variables in production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional `VITE_SENTRY_DSN`. Confirm Supabase Auth URL Configuration has Site URL `https://app.ledjer.id` and Redirect URL `https://app.ledjer.id/auth/callback`.
5. Rotate Supabase anon key if it was ever in version control.

## Recommended Before Launch

1. Set up uptime monitoring.
2. Configure backup verification.
3. Add basic E2E tests for critical paths.
4. Perform accessibility audit.
5. Load test with realistic data volume.
6. Document rollback procedure (see engineering report).

## Known Limitations

1. No invoice-level AR/AP tracking (party-level only).
2. No report export (CSV/PDF).
3. No automated closing entries.
4. No multi-currency support.
5. No audit log export.
6. Limited to Indonesian business context (IDR, Bahasa Indonesia).
