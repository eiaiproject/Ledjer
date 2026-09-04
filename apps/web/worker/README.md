# Ledjer Worker

Cloudflare Worker API for Ledjer (MVP cash-only).

## Routes

```
/api/health, /api/health/ready - Health & readiness checks
/api/metrics, /api/metrics/detailed - In-memory request metrics
/api/auth/register, /login, /logout, /me - Email/password auth
/api/auth/google/start, /google/callback - Google OAuth
/api/organizations/current - Current organization (GET/PATCH)
/api/accounts - Chart of accounts list
/api/accounts/cash-bank - Create a cash/bank account
/api/accounts/:accountId - Rename / toggle active (PATCH)
/api/transactions - List (filters, pagination) + create (idempotent)
/api/transactions/:transactionId - Detail
/api/transactions/:transactionId/void - Void a posted transaction
/api/reports/profit-loss - Laba rugi (date range)
/api/reports/balance-sheet - Neraca (as-of date)
/api/reports/general-ledger - Buku besar per akun (date range ± account)
/api/dashboard/summary, /alerts - Dashboard aggregates & warnings
/api/exports/transactions.csv - Transaction CSV export
```

Every `/api/*` route runs behind the CSRF origin check in `worker/index.ts`
(see [ADR 0003](../../../docs/adr/0003-csrf-origin-validation.md)), and
protected groups mount `requireAuth()` → `loadCurrentOrganization()` →
`requirePermission(...)`.

## Local Development

```bash
pnpm --filter web dev        # Vite dev server + Worker (port 5173)
pnpm --filter web cf:dev     # Alias `pnpm dev` (Vite dev + Worker)
```

## D1 Migrations

```bash
pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list
```

Fresh-database verification:

```bash
TMP_D1="$(mktemp -d /tmp/ledjer-d1.XXXXXX)"
cd apps/web && pnpm exec wrangler d1 migrations apply DB --local --persist-to "$TMP_D1"
rm -rf "$TMP_D1"
```

## Tests

```bash
pnpm --filter web exec vitest run worker/
```

Worker tests run against `worker/test/fake-d1.ts` (an in-memory FakeD1Database
that mirrors SQL shapes) seeded by `worker/test/fixtures.ts` (two
organizations with full COA + posted transactions). See
[docs/testing.md](../../../docs/testing.md).

## Structure

```
worker/
  index.ts              - Worker entrypoint + Hono app (CSRF, logging, metrics,
                          routes, cron backup + cleanup, Sentry wrapper)
  env.ts                - Env/binding types + AppContext variables
  auth/                 - Password hashing (PBKDF2 + pepper), tokens, encoding
  middleware/           - Auth (session), org-scoping, error handler,
                          structured request logger, metrics
  routes/               - Hono route handlers (thin controllers)
  services/             - Domain logic (transactions, accounts, reports,
                          dashboard, exports, auth/session/oauth, backup, ...)
  db/
    client.ts           - D1 query helpers (queryAll/queryFirst/execute/batch)
    schema.ts           - Table/column constants + tenant-scoped table list
    tenant-scoped.repository.ts - Runtime org-scoping guard (optional wrapper)
    migrations/         - Forward-only D1 SQL migrations (0001-0005)
  http/                 - Error types, JSON/Zod parsing + redaction,
                          audit-log writer, date normalization
  test/                 - FakeD1Database + deterministic seed fixtures
```
