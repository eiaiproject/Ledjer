# Phase 6 Handoff - Products and Inventory Foundation

Status: complete.

## Completed

- Added Worker product service for list/read/create/update/deactivate operations.
- Added stock movement foundation for opening and future inventory movements.
- Added `/api/products` routes:
  - `GET /api/products`
  - `POST /api/products`
  - `GET /api/products/:productId`
  - `PATCH /api/products/:productId`
  - `DELETE /api/products/:productId`
- Added `/api/inventory/movements` read route.
- Wired product and inventory routes into the Worker app.
- Added typed frontend product API client.
- Updated `/products` page to use Worker API instead of Supabase `from("products")` and `export_products_csv`.
- Added focused product service tests for product CRUD, opening stock, average cost, stock guards, duplicate codes, and organization scoping.

## Important Files

- `apps/web/worker/services/products.service.ts`
- `apps/web/worker/routes/products.routes.ts`
- `apps/web/worker/routes/inventory.routes.ts`
- `apps/web/worker/services/products.service.test.ts`
- `apps/web/src/lib/api/products.ts`
- `apps/web/src/pages/products/index.tsx`
- `apps/web/src/lib/errors.ts`
- `docs/cloudflare-rewrite-plan.md`

## Design Decisions

- All product and stock movement queries are scoped by `organizationContext.organization.id` from the authenticated session.
- Product reads require `products:read`.
- Product writes require `products:write`.
- Product money values are stored as integer minor units.
- Product stock values are stored as milli-units to avoid floating-point persistence.
- API responses keep the current frontend-compatible field names:
  - `purchase_price`
  - `selling_price`
  - `current_stock`
  - `min_stock`
- Creating a product with positive `currentStock` after onboarding is completed returns `initial_stock_not_supported`.
- Positive initial stock is only accepted while the organization onboarding status is not completed; it creates an `opening` stock movement.
- Stock changes flow through `recordStockMovement`, which rejects negative resulting stock with `insufficient_stock`.
- Average cost changes only for positive `opening` and `purchase` stock movements with a unit cost.
- Product mutations write `audit_logs`.
- Product CSV export is not ported yet; the products page shows a temporary toast instead of calling Supabase export code.

## Tests Run

- `pnpm --filter web exec vitest run worker/services/products.service.test.ts worker/services/accounts.service.test.ts worker/organization.test.ts`: pass, 3 files / 11 tests
- `pnpm --filter web exec vitest run worker/services/products.service.test.ts`: pass, 1 file / 3 tests
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 18 files / 126 tests
- `pnpm --filter web typecheck`: pass
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass, no migrations to apply
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply
- Fresh D1 apply with `--persist-to /tmp/...`: pass

## Manual Smoke Test

Ran against local Worker dev server on `http://localhost:5174` because port 5173 was already in use.

- Registered and manually verified user A in local D1.
- Logged in as user A and created org A.
- `GET /api/products`: 200.
- `POST /api/products`: 200, created a zero-stock product.
- `PATCH /api/products/:productId`: 200, updated product fields.
- Duplicate product code returned 409 `product_code_duplicate`.
- Product create with positive initial stock after onboarding returned 400 `initial_stock_not_supported`.
- Temporarily set org A onboarding status to `in_progress`.
- Product create with `currentStock: 7` returned 200.
- `GET /api/inventory/movements?productId=...`: 200, returned one `opening` movement with quantity `7`.
- Reset org A onboarding status to `completed`.
- Registered and manually verified user B in local D1.
- Logged in as user B, created org B, and created product B.
- User A received 404 `product_not_found` when reading product B.
- `DELETE /api/products/:productId`: 200, deactivated product A.

## Remaining Supabase Usage

The `/products` page no longer uses Supabase for list/create/update/deactivate/export. Supabase imports still remain in later domains:

- transaction forms and transaction posting
- dashboard summary
- reports
- team/invitations
- invitation accept
- CSV export/profile helpers

## Next Phase

- Phase 7 transaction posting:
  - transaction CRUD APIs
  - journal entry and journal line generation
  - idempotency keys
  - void/reversal flow
  - period lock/posting guards
  - inventory movement integration for purchase/sale transactions
  - accounting and inventory golden scenario tests

## Notes for Next Agent

- Read `docs/cloudflare-rewrite-plan.md` first.
- Do not remove Supabase dependency yet; transactions, dashboard, reports, team, invitations, and exports still use it.
- Product CSV export is intentionally stubbed until the exports phase.
- Full purchase/sale inventory posting is not implemented yet; only the product service stock movement foundation exists.
- Opening balances remain blocked until Phase 7 transaction/journal posting is ported.
