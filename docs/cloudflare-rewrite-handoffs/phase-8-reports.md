# Phase 8 Handoff - Reports

Status: complete.

## Completed

- Added Worker report service for:
  - trial balance
  - profit/loss
  - balance sheet
  - general ledger
- Added `/api/reports` routes:
  - `GET /api/reports/trial-balance?asOfDate=YYYY-MM-DD`
  - `GET /api/reports/profit-loss?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
  - `GET /api/reports/balance-sheet?asOfDate=YYYY-MM-DD`
  - `GET /api/reports/general-ledger?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&accountId=...`
- Wired report routes into the Worker app.
- Added typed frontend report API client.
- Updated report pages to use Worker API instead of Supabase RPCs:
  - trial balance
  - profit/loss
  - balance sheet
  - general ledger
- General ledger account lookup now uses the Worker accounts API.
- Added focused report invariant tests.

## Important Files

- `apps/web/worker/services/reports.service.ts`
- `apps/web/worker/routes/reports.routes.ts`
- `apps/web/worker/services/reports.service.test.ts`
- `apps/web/src/lib/api/reports.ts`
- `apps/web/src/pages/reports/trial-balance.tsx`
- `apps/web/src/pages/reports/profit-loss.tsx`
- `apps/web/src/pages/reports/balance-sheet.tsx`
- `apps/web/src/pages/reports/general-ledger.tsx`
- `docs/cloudflare-rewrite-plan.md`

## Design Decisions

- All reports are scoped by `organizationContext.organization.id` from the authenticated session.
- All report routes require `reports:read`.
- Reports read only posted journal entries.
- Trial balance uses account normal balance to place ending balance on debit or credit side.
- Profit/loss excludes `opening_balance` journal entries and groups by account type:
  - `revenue`
  - `cogs`
  - `expense`
  - `other_income`
  - `other_expense`
- Balance sheet computes assets, liabilities, equity, and current-period retained net income from D1 journal lines.
- General ledger computes running balance with a window function over all rows up to `toDate`, then filters visible rows by `fromDate`, preserving prior activity in running balance.
- Report CSV export is not ported yet; report pages show temporary toasts instead of calling Supabase export code.

## Tests Run

- `pnpm --filter web exec vitest run worker/services/reports.service.test.ts worker/services/transactions.service.test.ts worker/services/products.service.test.ts worker/services/accounts.service.test.ts worker/organization.test.ts`: pass, 5 files / 16 tests
- `pnpm --filter web typecheck`: pass
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 20 files / 131 tests
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass, no migrations to apply
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply
- Fresh D1 apply with `--persist-to /tmp/...`: pass

## Manual Smoke Test

Ran against local Worker dev server on `http://localhost:5174` because port 5173 was already in use.

- Registered and manually verified user A in local D1.
- Logged in as user A and created org A.
- Posted owner capital `1000000`.
- Posted cash sale `300000`.
- Posted expense payment `50000`.
- `GET /api/reports/trial-balance`: 200, debit and credit totals both `1300000`.
- `GET /api/reports/profit-loss`: 200, revenue `300000`, expense `50000`.
- `GET /api/reports/balance-sheet`: 200, assets `1250000`, liabilities plus equity `1250000`.
- `GET /api/reports/general-ledger` for cash account: 200, three rows, ending running balance `1250000`.
- Registered and manually verified user B in local D1.
- User B created org B.
- User B trial balance returned zero rows.
- Switching back to user A still returned org A trial balance total `1300000`.
- Temporary dev server was stopped after smoke test.

## Remaining Supabase Usage

Report pages no longer use Supabase. Supabase imports still remain in later domains:

- dashboard summary
- team/invitations
- invitation accept
- CSV export/profile helpers

## Next Phase

- Phase 9 team invitations:
  - team member listing
  - create invitation
  - accept invitation
  - revoke invitation
  - remove staff / role updates
  - permission matrix tests against Worker middleware/service checks

## Notes for Next Agent

- Read `docs/cloudflare-rewrite-plan.md` first.
- Do not remove Supabase dependency yet; dashboard, team, invitations, and exports still use it.
- Report CSV exports are intentionally stubbed until the exports phase.
- Existing Playwright E2E helpers are still Supabase-oriented.
- Dashboard still calls Supabase `get_dashboard_summary`; port it before final Supabase removal.
