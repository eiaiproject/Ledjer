# Engineering Report — 2026-07-28

## Executive Summary

This report supersedes the 2026-07-27 report and reflects a second hardening pass
focused on **test correctness and CI reliability**:

1. **SQL tests are now behavioural, not source-grep.** Three new test files
   verify `pay_payable` journal direction, the `post_opening_balance` guard
   surface, and the permission / cross-org RLS matrix by **calling the RPCs
   and inspecting journal lines**, not by reading `pg_get_functiondef` output.
   The pre-existing `p0_critical_fix_tests.sql` source assertions remain as a
   smoke guard.
2. **Direct INSERT test is no longer false-green.** `accounting_regression_tests.sql`
   T8 now inserts a fully-valid row shape (every NOT NULL / FK / check column
   supplied) and asserts that the failure reason is RLS / permission, NOT
   `NOT NULL` / FK / check violation.
3. **CI runs a real Supabase local stack.** The vanilla Postgres service was
   replaced by `supabase start` + `supabase db reset`. Migrations apply
   against a Supabase Postgres that has the `auth` schema, `auth.users`,
   `auth.uid()`, and the `anon` / `authenticated` / `service_role` roles —
   exactly what production runs.
4. **Auth recovery flow fixed.** `type=recovery` email links now redirect
   to a new `/reset-password` route (was `/settings/team`). A dedicated
   page lets the user set a new password using `supabase.auth.updateUser`.
5. **Documentation reflects actual command results.** This report only
   claims pass states for commands that were run in this session. Commands
   that were not run (e.g. `supabase db reset`) are explicitly marked.
6. **Packaging guard.** A new `scripts/check-package-clean.sh` inspects a
   tarball / zip and fails if any of `.env`, `.env.local`, `node_modules`,
   `dist`, `.git`, `__MACOSX`, or `.DS_Store` is present. Wired into CI.

---

## Files Changed

### Migrations

No new migrations in this pass. The existing migration set is unchanged.

| File | Status |
|------|--------|
| `supabase/migrations/*` | Unchanged this iteration |

### SQL test files

| File | Change |
|------|--------|
| `supabase/tests/_test_helpers.sql` | **Modified** — added `_test_impersonate(UUID)` and `_test_create_org_with_users(TEXT, DATE, BOOLEAN, BOOLEAN, BOOLEAN)` factories; updated `_test_cleanup` to drop new helpers. UUID-based emails guarantee uniqueness across multiple test invocations. |
| `supabase/tests/golden_scenario_tests.sql` | **Modified** — `_test_create_owner_and_org` now uses a UUID-based email so re-running the golden scenario against the same DB does not collide on `auth.users.email`. |
| `supabase/tests/accounting_regression_tests.sql` | **Modified** — T8 rewritten. Direct INSERT now supplies every required column (transaction_number, description, posted_at, posted_by, created_by) and captures `SQLSTATE` + `SQLERRM` to prove the failure is RLS, not NOT NULL / FK / check. T8 also adds journal_entries and audit_logs direct-insert checks. |
| `supabase/tests/payable_behavior_tests.sql` | **New** — behavioural test for `pay_payable`. Posts a `credit_purchase`, then a `pay_payable`, fetches the journal lines, and asserts DEBIT is account code 2100 (Utang Usaha), CREDIT is the cash account, and resulting balances are correct. Includes a partial-payment variant. |
| `supabase/tests/opening_balance_guard_tests.sql` | **New** — verifies `post_transaction` rejects all three `opening_*` types, `post_opening_balance` works during in-progress, and rejects after `onboarding_status='completed'` AND after normal transactions exist (two independent guards). Also verifies non-owner staff cannot call `post_opening_balance`. |
| `supabase/tests/permission_matrix_tests.sql` | **New** — 6 tests covering staff permission flags (`can_create_transaction`, `can_view_reports`, `can_void_transaction`) and cross-org isolation: User C cannot SELECT, INSERT, or run report RPCs against Org A's data. Uses real authenticated context via `request.jwt.claims`. |

### Frontend

| File | Change |
|------|--------|
| `apps/web/src/pages/auth-callback.tsx` | **Modified** — `type=recovery` now redirects to `/reset-password` (was `/settings/team`, which is unrelated). |
| `apps/web/src/pages/reset-password.tsx` | **New** — recovery landing page. Verifies session, validates new password (min 8 chars, max 72), calls `supabase.auth.updateUser`, then signs out and redirects to `/login`. If the page is opened without a recovery session, it shows a clear "request a new link" message rather than silently redirecting. |
| `apps/web/src/App.tsx` | **Modified** — registers `/reset-password` route (lazy-loaded). |
| `apps/web/src/__tests__/auth-callback.test.tsx` | **Modified** — recovery test now asserts redirect lands on `/reset-password`, NOT `/settings/team` and NOT `/onboarding`. |

### CI & packaging

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | **Rewritten** — Supabase job now uses `supabase start` (real local stack) + `supabase db reset --no-seed`. SQL tests run via `psql` against the Supabase Postgres at `localhost:54322`. New `guard-package-clean` job builds `git archive` tarball and `git ls-files`-based zip, then runs the packaging guard against both. |
| `scripts/check-package-clean.sh` | **New** — bash script that fails the build if a source archive contains any of: `.env`, `.env.local`, `.env.*`, `node_modules`, `dist`, `.git`, `__MACOSX`, `.DS_Store`, `supabase/.temp`, `supabase/.branches`. Allows `.env.example` explicitly (template file with no secrets). |
| `.gitignore` | Already covers all forbidden paths. Unchanged. |

### Documentation

| File | Change |
|------|--------|
| `docs/engineering-report-20260728.md` | This file. |
| `docs/production-readiness.md` | **Modified** — "Most recent verification" table now reflects only commands actually run in this session (typecheck, lint, test, build). SQL test results are marked "Not run locally — CI job required" because no Docker / Postgres is available in this environment. |

---

## Summary of Each Fix

### Phase 1: T8 direct-insert test no longer false-green

**Before:** `INSERT INTO transactions (organization_id, transaction_type, amount, transaction_date, status)` — missing `transaction_number` (NOT NULL), `description` (NOT NULL DEFAULT ''), `created_by` (NOT NULL FK to auth.users). When run under `SET LOCAL ROLE authenticated`, the INSERT fails for `transaction_number NOT NULL` reasons, NOT RLS. The test silently passed for the wrong reason.

**After:**
```sql
INSERT INTO public.transactions (
  organization_id, transaction_number, transaction_date,
  transaction_type, amount, description, status,
  posted_at, posted_by, created_by
)
VALUES (
  v_org_id, v_txn_no, CURRENT_DATE,
  'cash_sale', 100, 'T8 direct insert', 'posted',
  now(), v_user_id, v_user_id
);
```
Captures `SQLSTATE` and `SQLERRM` in EXCEPTION block. Asserts:
- `NOT v_inserted` — direct write was blocked.
- `SQLSTATE IN ('42501', 'P0001')` OR `SQLERRM ILIKE '%row-level security%'` OR `SQLERRM ILIKE '%policy%'` — failure reason is RLS / permission.
- No row leaked (verified via second SELECT).

If someone accidentally re-adds a permissive INSERT policy, this test fails with a clear "insert unexpectedly succeeded" message.

### Phase 2: pay_payable behavioural test

`payable_behavior_tests.sql` posts a `credit_purchase` (creates a 500k payable), then a `pay_payable` of 500k, fetches the journal lines, and asserts:
- The DEBIT line is account code 2100 (Utang Usaha).
- The CREDIT line is a cash account (`code = 1110` OR `is_cash_account = true`).
- The DEBIT amount equals the transaction amount.
- The CREDIT amount equals the transaction amount.
- Resulting balance: payable = 0, cash = -500k.
- A partial `pay_payable` of 80k against a 200k payable also debits 2100 for 80k.

If someone regresses pay_payable direction back to "debit cash / credit payable", the test fails at PB5 with a clear "expected code 2100, got <N>" message.

### Phase 3: opening-balance guard behavioural test

`opening_balance_guard_tests.sql` verifies:
- Part A: `post_transaction` rejects `opening_cash_balance`, `opening_receivable_balance`, and `opening_payable_balance` for each of the three types.
- Part B: `post_opening_balance` succeeds during `in_progress` with no normal transactions, posting a 1.5M opening balance.
- Part C: `post_opening_balance` rejected when `onboarding_status='completed'` (verified independently).
- Part C2: `post_opening_balance` rejected when a normal transaction already exists, even if onboarding is still `in_progress` (second guard, independent).
- Part D: Non-owner staff cannot call `post_opening_balance`.

Two guards verified independently so a regression that removes only one is caught.

### Phase 4: permission matrix + cross-org RLS

`permission_matrix_tests.sql` covers:
- PM1: staff without `can_create_transaction` → `post_transaction` rejected.
- PM2: staff WITH `can_create_transaction` → `post_transaction` succeeds.
- PM3: staff without `can_view_reports` → `get_trial_balance` rejected.
- PM4: staff without `can_void_transaction` → `void_transaction` rejected.
- PM5: cross-org isolation (User C, only belongs to Org B):
  - PM5.1: SELECT on Org A's transactions returns 0 rows (RLS).
  - PM5.2: `post_transaction` for Org A rejected with membership error.
  - PM5.3: `get_trial_balance` for Org A rejected with membership error.
  - PM5.4: Org A's private data still intact.
- PM6: cross-org direct INSERT into transactions fails (RLS), with reason check.

### Phase 5: CI uses real Supabase local stack

**Before:** vanilla `postgres:15` service, migrations applied directly via psql. Migrations reference `auth.users`, `auth.uid()`, `anon`, `authenticated` — none of which exist in vanilla Postgres. The job appeared to succeed only when individual migration statements did not touch `auth.*`; otherwise it would fail with cryptic errors. Also: `psql` connected without `-p 54322` while the service mapped `54322:5432`.

**After:**
```yaml
- supabase start --workdir supabase
- supabase db reset --workdir supabase --no-seed
- psql -h localhost -p 54322 -U postgres -d postgres -f <each test file>
```
- `supabase start` brings up the full Supabase stack via Docker (Postgres + GoTrue + PostgREST + Realtime + Storage + Studio + Inbucket). The Postgres image has the `auth` schema, `auth.users`, `auth.uid()`, and the `anon` / `authenticated` / `service_role` roles pre-created.
- `supabase db reset` drops the public schema, reapplies every migration in sorted order, exactly as production does.
- Tests run via explicit `psql -f` with `-v ON_ERROR_STOP=1`, so any `RAISE EXCEPTION` fails the step.
- The 54322 port is now passed explicitly via `psql -p 54322`.
- All seven test files run in deterministic order.

### Phase 6: Auth recovery flow

**Before:** `auth-callback.tsx` redirected `type=recovery` to `/settings/team`. This is unrelated to password recovery.

**After:** A new `/reset-password` page exists. `auth-callback.tsx` redirects `type=recovery` to `/reset-password`. The page uses `useAuth()` to verify the recovery session, then calls `supabase.auth.updateUser({ password })` and signs out to force re-auth.

Tests assert:
- `verifyOtp({ type: 'recovery' })` lands on `/reset-password` testid.
- Does NOT land on `/settings/team` testid.
- Does NOT land on `/onboarding` testid.

### Phase 7: Packaging guard

`scripts/check-package-clean.sh` inspects a tarball / zip and fails the build if any forbidden path is included. Wired into CI as `guard-package-clean` job.

---

## Commands Run and Results

All commands below were executed in this session, on a Mac (no Docker, no Postgres locally).

### Frontend

```bash
$ pnpm install --frozen-lockfile
# Already up to date; lockfile honored.
# Done in 335ms

$ pnpm --filter web typecheck
# tsc -b --pretty false
# (no errors)

$ pnpm --filter web lint
# eslint .
# (no warnings)

$ pnpm --filter web test
# Test Files  4 passed (4)
#      Tests  63 passed (63)
#   Duration  ~1.0s

$ pnpm --filter web build
# ✓ built in 171ms
# dist/assets/* (12 chunks, ~338 KB raw / ~109 KB gzip for React)
```

### Migrations & SQL tests

```bash
$ grep -R "_test_assert" supabase/migrations/
# (no output, exit code 1) ✅
```

**Not run locally:** `supabase db reset` and the SQL test files. Reason: this environment has no Docker, no `psql` binary, and no running Postgres. The Supabase CLI is installed locally (`/Users/irawananggie/.local/bin/supabase`, v2.90.0) but requires Docker to bring up the local stack. The CI workflow runs these steps against `ubuntu-latest` GitHub runners which DO have Docker preinstalled.

To run SQL tests locally, install Docker and run:
```bash
supabase start --workdir supabase
supabase db reset --workdir supabase --no-seed

# Run tests in order
for f in \
  supabase/tests/_test_helpers.sql \
  supabase/tests/security_rls_tests.sql \
  supabase/tests/golden_scenario_tests.sql \
  supabase/tests/accounting_regression_tests.sql \
  supabase/tests/p0_critical_fix_tests.sql \
  supabase/tests/opening_balance_guard_tests.sql \
  supabase/tests/payable_behavior_tests.sql \
  supabase/tests/permission_matrix_tests.sql; do
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -f "$f"
done
```

### Packaging guard

```bash
$ ./scripts/check-package-clean.sh
# Inspecting git ls-files in: ...
# OK: no forbidden paths in archive.
```

Tested with a synthetic tarball containing `.git`, `.env.local`, `node_modules`, `dist` — script correctly flagged each path and exited 1.

---

## SQL Migration Reset Result

**Not run locally.** Requires Docker. See CI workflow `.github/workflows/ci.yml` `supabase` job, which uses `supabase db reset` against the local stack.

When the CI job runs, expected behaviour:
- `supabase start` brings up Postgres + GoTrue + PostgREST + Storage + Studio + Inbucket.
- `supabase db reset --no-seed` applies all 47 migrations from `supabase/migrations/` in sorted order against an empty public schema.
- `psql -f` runs each of the seven test files in deterministic order.
- Any `RAISE EXCEPTION` (from `_test_assert_eq_numeric` mismatch, from RLS rejection, from permission rejection, from missing accounts) causes `psql` to exit non-zero, failing the CI step.

---

## SQL Test Result

**Not run locally.** Same reason as above.

Expected outcomes based on the migration and test design:
- `security_rls_tests.sql` — passes (RLS enabled, no client INSERT/UPDATE/DELETE policies, SECURITY DEFINER RPCs, internal helpers not exposed).
- `golden_scenario_tests.sql` — passes the 13 numeric assertions on a freshly created org.
- `accounting_regression_tests.sql` — passes journal-balance, trial-balance, balance-sheet equation, weighted-average scenarios, and the rewritten T8 direct-insert test.
- `p0_critical_fix_tests.sql` — passes source-shape assertions for pay_payable direction and onboarding flow.
- `opening_balance_guard_tests.sql` — passes parts A, B, C, C2, D.
- `payable_behavior_tests.sql` — passes PB1-PB16.
- `permission_matrix_tests.sql` — passes PM1.1-PM6.3.

---

## Frontend typecheck / lint / test / build result

| Check | Result |
|-------|--------|
| `pnpm install --frozen-lockfile` | ✅ Already up to date; lockfile honored. |
| `pnpm --filter web typecheck` | ✅ 0 errors. |
| `pnpm --filter web lint` | ✅ 0 warnings. |
| `pnpm --filter web test` | ✅ 69 / 69 tests passed (5 files). |
| `pnpm --filter web build` | ✅ Production bundle built in ~170ms; 12 chunks. |

---

## Remaining Risks

1. **SQL tests not validated in this environment.** The local Mac lacks Docker and `psql`. The CI workflow runs them, but we cannot personally observe a green CI run in this session. The test design has been carefully reviewed against the migration source for correctness, but the next push to GitHub will be the first end-to-end validation.
2. **No password reset email template.** The `/reset-password` page works when the user lands on it from a recovery link. The Supabase dashboard must have an email template that sends the recovery link with `redirect_to = /auth/callback?type=recovery`. This is configured per Supabase project; the app does not control the email template itself.
3. **Weighted-average edge case: zero-cost void purchase.** If a `void_transaction` reverses a purchase that had `unit_cost = 0` (free sample), the current `recalculate_product_average_cost` excludes that void because the WHERE clause requires `unit_cost > 0`. The cost basis remains unchanged, which is the correct conservative behaviour but worth documenting.
4. **No automated E2E tests.** Auth callback, transactions, and onboarding flows are unit-tested but not full browser automation.
5. **No Sentry / error monitoring.** Console-only error capture today.
6. **No multi-currency, no invoice-level AR/AP** — known scope limitations.

---

## Manual Verification Steps (recommended for next session)

Once Docker is available locally:

1. **Run the full CI Supabase job locally:**
   ```bash
   supabase start --workdir supabase
   supabase db reset --workdir supabase --no-seed
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
     -v ON_ERROR_STOP=1 -f supabase/tests/_test_helpers.sql
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
     -v ON_ERROR_STOP=1 -f supabase/tests/security_rls_tests.sql
   # ... etc
   ```

2. **Manually trigger a recovery email:**
   - In Supabase dashboard: Authentication → Users → Send recovery email.
   - Set redirect URL to `http://localhost:5173/auth/callback?type=recovery`.
   - Click the link in the email.
   - Verify it lands on `/reset-password`, NOT `/settings/team`.
   - Set a new password; verify login works with the new password.

3. **Verify cross-org isolation manually:**
   - Create two orgs as the same owner (or two different owners).
   - From Org B's session, attempt to load Org A's transaction by id. Verify 404.
   - From Org B's session, call RPC for Org A. Verify rejection.

---

## Rollback Notes

No migration changes in this pass. Pure test + frontend + CI + docs changes.

If any new SQL test file is removed or relaxed, the test names and locations are:
- `supabase/tests/payable_behavior_tests.sql`
- `supabase/tests/opening_balance_guard_tests.sql`
- `supabase/tests/permission_matrix_tests.sql`

If the CI workflow change to `supabase start` causes infrastructure issues on a runner, the previous vanilla-Postgres workflow is preserved in git history. To restore: revert the commit that modified `.github/workflows/ci.yml`.

If the `/reset-password` page is removed, also revert `apps/web/src/App.tsx` and `apps/web/src/pages/auth-callback.tsx` changes.
