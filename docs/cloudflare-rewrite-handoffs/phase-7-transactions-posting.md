# Phase 7 Handoff - Accounting Transaction Posting

Status: complete.

## Completed

- Added Worker transaction posting service.
- Added transaction list/detail/journal/void routes:
  - `GET /api/transactions`
  - `POST /api/transactions`
  - `GET /api/transactions/:transactionId`
  - `GET /api/transactions/:transactionId/journal`
  - `POST /api/transactions/:transactionId/void`
- Added minimal party lookup route:
  - `GET /api/parties`
- Wired transaction and party routes into the Worker app.
- Added typed frontend API clients for transactions and parties.
- Updated transaction list, new transaction form, and transaction detail page to use Worker API instead of Supabase table/RPC calls.
- Added D1 batch helper for grouped posting writes.
- Added unit tests for journal balance invariant.

## Important Files

- `apps/web/worker/services/transactions.service.ts`
- `apps/web/worker/routes/transactions.routes.ts`
- `apps/web/worker/services/parties.service.ts`
- `apps/web/worker/routes/parties.routes.ts`
- `apps/web/worker/services/transactions.service.test.ts`
- `apps/web/worker/db/client.ts`
- `apps/web/src/lib/api/transactions.ts`
- `apps/web/src/lib/api/parties.ts`
- `apps/web/src/lib/api/accounts.ts`
- `apps/web/src/pages/transactions/index.tsx`
- `apps/web/src/pages/transactions/new.tsx`
- `apps/web/src/pages/transactions/[id].tsx`
- `apps/web/src/lib/errors.ts`
- `docs/cloudflare-rewrite-plan.md`

## Design Decisions

- All transaction, journal, party, and stock operations are scoped by `organizationContext.organization.id` from the authenticated session.
- Frontend sends transaction intent only; journal rows are built server-side.
- Money is stored as integer minor units in `amount_minor`, `debit_minor`, and `credit_minor`.
- Product quantities are stored as milli-units.
- Transaction create requires `idempotencyKey`; duplicate key returns the existing transaction result.
- Void requires `idempotencyKey`; duplicate key returns the existing reversal result when it belongs to the same original transaction.
- Transaction and journal numbers use `organization_document_counters`.
- Posted journal lines are checked for positive balanced debit/credit totals before insert.
- Void creates a reversal transaction plus reversal journal lines by swapping original debit/credit lines.
- Original rows are not deleted.
- Product purchases create `purchase` stock movements and update product average cost.
- Product sales create `sale` stock movements, reduce stock, and write COGS/inventory journal lines.
- Product sale void creates a `void` stock movement and restores stock.
- Partially paid credit sale/purchase void is blocked with `partial_void_not_supported` until settlement/refund behavior is ported.
- Transaction CSV export is not ported yet; the transaction list shows a temporary toast instead of calling Supabase export code.

## Tests Run

- `pnpm --filter web exec vitest run worker/services/transactions.service.test.ts worker/services/products.service.test.ts worker/services/accounts.service.test.ts worker/organization.test.ts`: pass, 4 files / 14 tests
- `pnpm --filter web typecheck`: pass
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 19 files / 129 tests
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass, no migrations to apply
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply
- Fresh D1 apply with `--persist-to /tmp/...`: pass

## Manual Smoke Test

Ran against local Worker dev server on `http://localhost:5174` because port 5173 was already in use.

- Registered and manually verified user A in local D1.
- Logged in as user A and created org A.
- Created a product with zero stock.
- Posted owner capital transaction.
- Posted the same owner capital request again with the same idempotency key and received the same transaction id.
- `GET /api/transactions/:id/journal` returned a balanced journal.
- Verified the transaction audit log exists in D1.
- Posted product cash purchase:
  - stock became `10`
  - product purchase/average cost became `1000`
- Posted product cash sale:
  - sale journal balanced
  - journal included revenue plus COGS/inventory lines
  - stock became `7`
- Voided the product sale:
  - original transaction became `voided`
  - reversal transaction was created
  - stock returned to `10`
  - stock movement sum matched product stock
- Registered and manually verified user B in local D1.
- User B created org B and posted a transaction.
- User A received 404 `transaction_not_found` when trying to read user B's transaction.
- Temporary dev server was stopped after smoke test.

## Remaining Supabase Usage

The transaction list, new transaction form, and transaction detail page no longer use Supabase. Supabase imports still remain in later domains:

- dashboard summary
- reports
- team/invitations
- invitation accept
- CSV export/profile helpers

## Next Phase

- Phase 8 reports:
  - trial balance from D1 journal lines
  - profit/loss from D1 journal lines
  - balance sheet from D1 journal lines
  - general ledger from D1 journal lines
  - report golden scenarios using transactions posted by Phase 7
  - migrate report pages away from Supabase RPCs

## Notes for Next Agent

- Read `docs/cloudflare-rewrite-plan.md` first.
- Do not remove Supabase dependency yet; dashboard, reports, team, invitations, and exports still use it.
- Transaction CSV export is intentionally stubbed until the exports phase.
- Existing Playwright E2E helpers are still Supabase-oriented.
- Durable Objects were evaluated and deferred for MVP, but org-level posting serialization should be revisited before high-concurrency production.
- Partial paid credit transaction voiding is intentionally blocked until settlement/refund logic is designed.
