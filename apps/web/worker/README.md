# Ledjer Worker

Cloudflare Worker API for Ledjer. For the product overview and full setup instructions, see the [root README](../../../README.md).

## Routes

```text
GET  /api/health, /api/health/ready       Health and readiness checks
GET  /api/metrics, /api/metrics/detailed  In-memory request metrics
POST /api/auth/register                   Email/password registration
POST /api/auth/login                      Email/password login
POST /api/auth/logout                     Revoke the current session
GET  /api/auth/me                         Current user and session
PATCH /api/auth/me                        Update the business name
GET  /api/auth/google/start               Start Google OAuth
GET  /api/auth/google/callback            Finish Google OAuth
GET  /api/accounts                        Chart of accounts
POST /api/accounts/cash-bank              Create a cash or bank account
PATCH /api/accounts/:accountId            Rename or toggle an account
GET  /api/products                        Product list with stock and WAC
POST /api/products                        Create a product
PATCH /api/products/:productId            Update a product
GET  /api/transactions                    List transactions
POST /api/transactions                    Create a transaction
GET  /api/transactions/:transactionId     Transaction detail
POST /api/transactions/:transactionId/void  Void a posted transaction
GET  /api/reports/profit-loss             Profit and loss
GET  /api/reports/balance-sheet           Balance sheet
GET  /api/reports/general-ledger          General ledger
GET  /api/dashboard/summary, /alerts      Dashboard aggregates and warnings
GET  /api/exports/transactions.csv        Transaction CSV export
```

Inventory behavior is part of the current API:

- `purchase` posts Inventory debit / Cash or Bank credit and adds stock at the purchase cost.
- `cash_in` with `items` posts Cash debit / Income credit and Cost of Goods Sold debit / Inventory credit using moving-average cost.
- `stock_loss` with `items` posts Inventory Loss debit / Inventory credit without touching cash.
- Voiding recalculates stock and average cost from posted stock movements.

Every `/api/*` request passes through the CSRF origin check in `worker/index.ts`. Protected route groups mount `requireAuth()`, and book queries filter by `session.user_id`. One account owns one book; there is no role layer.

## Local Development

From the repository root:

```bash
pnpm --filter web dev
pnpm --filter web db:migrations:apply:local
```

`pnpm --filter web dev` runs the Vite frontend and Worker API together on port 5173.

## Migrations

```bash
pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list
```

Migrations are forward-only. Fresh-database verification:

```bash
TMP_D1="$(mktemp -d /tmp/ledjer-d1.XXXXXX)"
cd apps/web && pnpm exec wrangler d1 migrations apply DB --local --persist-to "$TMP_D1"
rm -rf "$TMP_D1"
```

## Tests

From the repository root:

```bash
pnpm --filter web exec vitest run worker/
```

Worker tests run against `worker/test/fake-d1.ts`, an in-memory Fake D1 database seeded by `worker/test/fixtures.ts`. See [docs/testing.md](../../../docs/testing.md) for the complete testing guide.

## Structure

```text
worker/
  index.ts                  Worker entrypoint, Hono app, cron, and Sentry wrapper
  env.ts                    Environment and binding types
  auth/                     Password hashing, tokens, and encoding
  middleware/               Auth, error handling, logging, and metrics
  routes/                   Hono route handlers
  services/                 Transactions, reports, accounts, auth, backup, and sync
  db/
    client.ts               D1 query helpers
    schema.ts               Table and column constants
    user-scoped.repository.ts  Runtime user-scoping guard
    migrations/             Forward-only D1 migrations
  http/                     Errors, JSON parsing, redaction, and audit logging
  test/                     Fake D1 database and deterministic fixtures
```
