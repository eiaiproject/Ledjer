# Engineering Report — 2026-07-29

## Executive Summary

Third hardening pass. Focus: **P0/P1 review remediation** covering type drift,
opening-balance consistency, SECURITY DEFINER search_path audit, balance-sheet
CTE rewrite, inventory golden tests, React Query invalidation gaps, and a
duplicated DB-type source that silently drifted.

Headline changes:

1. **Single canonical Supabase database types source.**
   `packages/database-types/index.ts` is now the only source of truth.
   `apps/web/src/lib/database-types.ts` is reduced to a `@deprecated` re-export
   shim. All frontend imports now resolve to `@ledjer/database-types`.
   A new `pnpm db-types:check` script + CI `db-types-guard` job fails the build
   if the shim drifts from the package.
2. **P0.4 SECURITY DEFINER search_path audit complete.**
   `rename_account` was the only SECURITY DEFINER function without `SET
   search_path = public`. Fixed in
   `supabase/migrations/20260728_000000_p0_search_path_balance_sheet_cte.sql`.
   A new CI test (`security_rls_tests.sql` TEST 3b) fails if ANY SECURITY
   DEFINER function is missing `SET search_path` — preventing future drift.
3. **`get_balance_sheet` rewritten without TEMP TABLE.**
   Old implementation used `CREATE TEMPORARY TABLE _bs_account_balances` which
   breaks under pgbouncer transaction-pooling mode. New implementation is a
   pure CTE inside `RETURN QUERY`. Output shape and permissions preserved.
4. **React Query invalidation after financial mutations.**
   `post_transaction` and `void_transaction` callers now invalidate every
   affected query key (`accounts`, `products`, `parties`, `trial-balance`,
   `profit-loss`, `balance-sheet`, `general-ledger`) so dashboards and reports
   never display stale data after a sale/purchase/void.
5. **Inventory golden scenario added.**
   New `supabase/tests/inventory_golden_tests.sql` exercises weighted-average
   cost across two purchases + a sale + a void + an oversell, and asserts
   that `Σ stock_movements.quantity = current_stock` after each step.
6. **Opening balance consistency locked down (Path A).**
   The general `post_transaction` RPC explicitly rejects
   `opening_cash_balance`, `opening_receivable_balance`,
   `opening_payable_balance`. The UI's `GENERAL_TRANSACTION_TYPE_LABELS` does
   not contain any opening_* types — the UI cannot guide the user into a
   state the backend rejects. `opening_balance_guard_tests.sql` exercises all
   three rejection paths and the post-onboarding / normal-txn guards on
   `post_opening_balance`.
7. **Duplicate-party prevention.**
   Unique partial index `idx_parties_org_name_unique` on
   `parties(organization_id, lower(trim(name))) WHERE is_active = true`
   discourages duplicate customer/supplier creation from the transaction form.
   Existing soft-delete flow still works (soft-deleted rows are excluded).
8. **AR/AP party-level behavior documented + soft UI warning.**
   `docs/accounting-rules.md` now has an "MVP Scope Notice" section explaining
   that AR/AP is party-level (not invoice-level) and that overpayment produces
   a negative receivable/payable balance. The receive_receivable and
   pay_payable form helpers in `_helpers.ts` carry this warning in the
   helper text shown under the party field.
9. **P0.A baseline verified.**
   `pnpm install --frozen-lockfile`, `pnpm --filter web typecheck`,
   `pnpm --filter web lint`, `pnpm --filter web test` (81/81), and
   `pnpm --filter web build` all run clean against this change set.

## Files Changed

### Created
- `scripts/check-db-types.sh` — fails CI if the apps/web DB-types shim drifts
  from `@ledjer/database-types`.
- `supabase/migrations/20260728_000000_p0_search_path_balance_sheet_cte.sql`
  — adds `SET search_path = public` to `rename_account`, rewrites
  `get_balance_sheet` as CTE-only, adds unique partial index on parties.
- `supabase/tests/inventory_golden_tests.sql` — weighted-average + sale/void
  + oversell behavioral tests.
- `docs/engineering-report-20260729.md` (this file).

### Modified
- `packages/database-types/index.ts` — added `rename_account` function type
  (previously only present in the stale apps/web shim).
- `apps/web/src/lib/database-types.ts` — replaced 1661-line duplicate with a
  thin `@deprecated` re-export shim from `@ledjer/database-types`.
- `apps/web/src/lib/supabase.ts` — import from `@ledjer/database-types`.
- `apps/web/src/pages/onboarding.tsx` — same.
- `apps/web/src/pages/settings/team.tsx` — same.
- `apps/web/src/pages/transactions/index.tsx` — same.
- `apps/web/src/pages/transactions/new.tsx` — invalidate all reports /
  products / parties / accounts after `post_transaction`.
- `apps/web/src/pages/transactions/[id].tsx` — invalidate all reports /
  products / parties / accounts after `void_transaction`.
- `apps/web/src/pages/transactions/_helpers.ts` — added overpayment warning
  text to `receive_receivable` / `pay_payable` helper copy.
- `supabase/tests/security_rls_tests.sql` — added TEST 3b asserting every
  SECURITY DEFINER function declares `SET search_path`.
- `.github/workflows/ci.yml` — new `db-types-guard` job + new
  `inventory_golden_tests.sql` step in the `supabase` job.
- `docs/accounting-rules.md` — added "MVP Scope Notice: Party-level AR/AP"
  section documenting the MVP behavior and what an invoice-level migration
  would require.
- `docs/production-readiness.md` — refreshed status to reflect the new
  migration, CTE balance sheet, search_path CI test, inventory golden
  scenario, and database-types drift guard.
- `package.json` — added `db-types:check` script.

## Verification Commands (Run This Session)

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | ✅ Already up to date; lockfile honored |
| `pnpm --filter web typecheck` | ✅ tsc -b clean, 0 errors |
| `pnpm --filter web lint` | ✅ eslint clean, 0 warnings |
| `pnpm --filter web test` | ✅ 81/81 tests passed (8 files) |
| `pnpm --filter web build` | ✅ vite production build in ~170ms |
| `pnpm db-types:check` | ✅ Shim and canonical package look consistent (canonical = 1666 lines) |
| `bash scripts/check-package-clean.sh` | ✅ no forbidden paths in `git ls-files` |
| `grep -RI "_test_assert" supabase/migrations/` | ✅ no matches (CI guard OK) |
| `supabase start --workdir supabase` | ❌ BLOCKED — Docker not installed in this environment (CI runner has Docker; the GitHub Actions `supabase` job runs the full `supabase db reset` and the SQL test files against a real Supabase Postgres) |
| `supabase db reset --workdir supabase --no-seed` | ❌ BLOCKED — same reason; CI runs this |
| SQL tests in `supabase/tests/` | ❌ BLOCKED here; CI runs them. New tests added: `inventory_golden_tests.sql`. |

## What Was NOT Done In This Pass

- E2E tests with Playwright: out of scope for this pass. The CI workflow runs
  the frontend unit tests + every SQL test file against a real local Supabase
  Postgres; E2E would require either adding `@playwright/test` as a heavy
  dependency or running against a deployed environment. Documented in
  `docs/qa-checklist.md` and the production-readiness doc.
- Production monitoring (Sentry, uptime, alerting): deferred to ops.
- PDF / CSV report export: deferred to product.
- Invoice-level AR/AP: deferred to product (documented as MVP limitation).
- Accessibility audit: deferred to design.

## Risks Remaining

- Docker is unavailable in this sandbox, so the new migration and tests are
  not exercised locally. CI is the only execution path that catches breakage.
- `transaction_status` enum in the database types lists `draft` but no
  transaction ever has status='draft'; harmless but worth removing later.
- The new unique partial index on parties blocks re-creating a party that
  was soft-deleted. If users complain, fall back to a non-unique index and
  add a UI "did you mean..." picker instead.
- The `apps/web/src/lib/database-types.ts` shim still exists. Eventually
  delete it once all internal imports use `@ledjer/database-types`.
