# Phase 10 Handoff - CSV Exports and Cleanup

Status: complete.

## Completed

- Added Worker export service for:
  - accounts CSV
  - products CSV
  - transactions CSV
  - trial balance CSV
  - profit/loss CSV
  - balance sheet CSV
  - general ledger CSV
- Added `/api/exports` routes:
  - `GET /api/exports/accounts.csv`
  - `GET /api/exports/products.csv`
  - `GET /api/exports/transactions.csv`
  - `GET /api/exports/reports/trial-balance.csv`
  - `GET /api/exports/reports/profit-loss.csv`
  - `GET /api/exports/reports/balance-sheet.csv`
  - `GET /api/exports/reports/general-ledger.csv`
- Wired export routes into the Worker app.
- Added CSV download support to the frontend API client.
- Replaced Supabase CSV RPC helper with Worker download helper.
- Updated export buttons on:
  - accounts
  - products
  - transactions
  - trial balance
  - profit/loss
  - balance sheet
  - general ledger
- Added `canCreateExports` frontend permission helper.
- Added scheduled cleanup service and daily Wrangler cron trigger.
- Added focused CSV security and cleanup tests.

## Important Files

- `apps/web/worker/services/exports.service.ts`
- `apps/web/worker/services/maintenance.service.ts`
- `apps/web/worker/services/exports.service.test.ts`
- `apps/web/worker/routes/exports.routes.ts`
- `apps/web/worker/index.ts`
- `apps/web/wrangler.jsonc`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/csv-export.ts`
- `apps/web/src/hooks/useOrganization.ts`
- `apps/web/src/pages/accounts/index.tsx`
- `apps/web/src/pages/products/index.tsx`
- `apps/web/src/pages/transactions/index.tsx`
- `apps/web/src/pages/reports/trial-balance.tsx`
- `apps/web/src/pages/reports/profit-loss.tsx`
- `apps/web/src/pages/reports/balance-sheet.tsx`
- `apps/web/src/pages/reports/general-ledger.tsx`
- `docs/cloudflare-rewrite-plan.md`

## Design Decisions

- Export routes use server-side `organizationContext.organization.id`; frontend `organizationId` arguments are kept only for backward-compatible helper signatures and are ignored.
- All export routes require `exports:create`. With the current role matrix, that means owner/admin only.
- CSV formula injection is neutralized by prefixing dangerous leading characters (`=`, `+`, `-`, `@`, tab) with a single quote and quoting the cell.
- CR/LF values are normalized to spaces so exported data cannot break row boundaries.
- CSV headers include safe download headers:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="..."`
  - `Cache-Control: no-store`
  - `X-Content-Type-Options: nosniff`
- Small exports are returned directly as response bodies.
- R2/Queues are deferred because no R2/Queue bindings exist yet and current MVP exports are small.
- Daily cron cleanup deletes expired sessions, email verification tokens, password reset tokens, and expired `export_jobs`.
- No export-file cleanup is implemented yet because async R2 export files are not implemented.

## Tests Run

- `pnpm --filter web exec vitest run worker/services/exports.service.test.ts`: pass, 1 file / 3 tests
- `pnpm --filter web exec vitest run worker/services/exports.service.test.ts worker/index.test.ts worker/organization.test.ts`: pass, 3 files / 8 tests
- `pnpm --filter web typecheck`: pass
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 22 files / 138 tests
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass, no migrations to apply
- `pnpm --filter web db:migrations:list`: pass after sequential retry
- Fresh D1 apply with `--persist-to /tmp/...`: pass

## Manual Smoke Test

Ran against local Worker dev server on `http://127.0.0.1:5174` because port 5173 was already in use.

- Registered and manually verified owner and second-org users in local D1.
- Owner created an organization.
- Created formula-risk data:
  - account name `=SUM(A1)`
  - product code `+SKU`
  - product name `+CMD`
  - transaction description `=HACK`
  - product description with newline
- `GET /api/exports/accounts.csv` returned safe CSV headers and escaped `=SUM(A1)`.
- `GET /api/exports/products.csv` escaped `+SKU` and `+CMD`, and normalized multiline description.
- `GET /api/exports/transactions.csv` escaped `=HACK`.
- `GET /api/exports/reports/general-ledger.csv` escaped `=HACK`.
- Trial balance, profit/loss, and balance sheet CSV endpoints returned expected CSV headers.
- A second organization export did not include the first organization's formula-risk account/product/transaction data.
- Temporary dev server should be stopped before final response.

## Remaining Supabase Usage

CSV export runtime no longer uses Supabase.

Known remaining Supabase runtime code:

- `apps/web/src/pages/dashboard.tsx` still calls `get_dashboard_summary`.
- `apps/web/src/lib/profiles.ts` still has a Supabase helper.
- `apps/web/src/lib/supabase.ts` remains until final cleanup.
- Some tests still mock Supabase or assert legacy RPC arg contracts.
- `packages/database-types` still exists for legacy test/type references.

## Next Phase

- Phase 11 Supabase removal and cleanup:
  - port dashboard summary before removing Supabase runtime code
  - remove Supabase dependency/env wiring after runtime usage is gone
  - update tests that mock Supabase or legacy RPC contracts
  - update CI/deploy docs for Cloudflare-only flow

## Notes for Next Agent

- Read `docs/cloudflare-rewrite-plan.md` first.
- Dashboard is the remaining user-facing Supabase runtime page. Port it before deleting `src/lib/supabase.ts`.
- Existing Playwright E2E helpers are still Supabase-oriented.
- R2/Queue async export support is intentionally not implemented yet.
- Email delivery remains stubbed for auth verification/reset and team invitations.
