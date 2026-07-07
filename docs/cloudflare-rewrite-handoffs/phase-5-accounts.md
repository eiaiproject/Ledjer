# Phase 5 Handoff - Accounts and Chart of Accounts

Status: complete.

## Completed

- Added Worker account service for list/read/create/update/delete operations.
- Added deterministic cash/bank account code generation.
- Added account safety rules for system and locked accounts.
- Added `/api/accounts` routes:
  - `GET /api/accounts`
  - `POST /api/accounts`
  - `GET /api/accounts/:accountId`
  - `PATCH /api/accounts/:accountId`
  - `DELETE /api/accounts/:accountId`
  - `POST /api/accounts/generate-code`
  - `GET /api/accounts/cash-bank`
  - `POST /api/accounts/cash-bank`
- Wired account routes into the Worker app.
- Added typed frontend account API client.
- Updated `/accounts` page to use Worker API instead of Supabase `from("accounts")`, `create_cash_bank_account`, and `rename_account`.
- Added focused account service tests for code generation and safety rules.

## Important Files

- `apps/web/worker/services/accounts.service.ts`
- `apps/web/worker/routes/accounts.routes.ts`
- `apps/web/worker/services/accounts.service.test.ts`
- `apps/web/src/lib/api/accounts.ts`
- `apps/web/src/pages/accounts/index.tsx`
- `apps/web/src/lib/errors.ts`
- `docs/cloudflare-rewrite-plan.md`

## Design Decisions

- All account queries are scoped by `organizationContext.organization.id` from the authenticated session.
- Account reads require `accounts:read`.
- Account writes require `accounts:write`.
- Cash/bank code generation is server-side:
  - cash: `1111-1119`
  - bank: `1121-1129`
  - QRIS/e-wallet: `1130-1139`
- Default accounts `1110` and `1120` remain reserved and are never generated for new cash/bank accounts.
- The first available gap is selected deterministically.
- Locked accounts cannot be renamed.
- System or locked accounts cannot be deleted or deactivated.
- Account mutations write `audit_logs`.
- Account CSV export is not ported yet; the accounts page shows a temporary toast instead of calling Supabase export code.

## Tests Run

- `pnpm --filter web exec vitest run worker/services/accounts.service.test.ts`: pass, 1 file / 5 tests
- `pnpm --filter web exec vitest run worker/services/accounts.service.test.ts worker/organization.test.ts`: pass, 2 files / 8 tests
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 17 files / 123 tests
- `pnpm --filter web typecheck`: pass
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass, no migrations to apply
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply
- Fresh D1 apply with `--persist-to /tmp/...`: pass

## Manual Smoke Test

Ran against local Worker dev server on `http://localhost:5174` because port 5173 was already in use.

- Registered and manually verified a new local D1 user.
- Logged in and created an organization.
- `GET /api/accounts`: 200, returned 26 default accounts.
- Confirmed default cash code `1110` and default bank code `1120`.
- `POST /api/accounts/generate-code` with `{ "kind": "cash" }`: 200, returned `1111`.
- `POST /api/accounts/cash-bank`: 200, created a custom cash account with code `1111`.
- Next cash code generation returned `1112`.
- `PATCH /api/accounts/:id` on custom account: 200, renamed successfully.
- `PATCH /api/accounts/:id` on locked default `1110`: 403 `account_locked`.
- `DELETE /api/accounts/:id` on default `1110`: 403 `account_protected`.
- `DELETE /api/accounts/:id` on custom account: 204.
- Temporary dev server was stopped after smoke test.

## Remaining Supabase Usage

The `/accounts` page no longer uses Supabase for list/create/rename. Supabase imports still remain in later domains:

- transaction forms that query account dropdowns
- general ledger account dropdown
- products
- transactions
- reports
- team/invitations
- invitation accept
- CSV export/profile helpers

## Next Phase

- Phase 6 products and inventory foundation:
  - product CRUD APIs
  - `products:read` / `products:write` permission enforcement
  - inventory account references scoped to current organization
  - stock movement foundation
  - update products page away from Supabase

## Notes for Next Agent

- Read `docs/cloudflare-rewrite-plan.md` first.
- Do not remove Supabase dependency yet; transactions, reports, team, exports, and products still use it.
- Account dropdowns in transaction/report pages still call Supabase and should be migrated in their respective phases.
- The account CSV export button is intentionally stubbed until the exports phase.
