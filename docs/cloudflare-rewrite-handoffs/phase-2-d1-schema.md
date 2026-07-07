# Phase 2 Handoff - D1 Schema Foundation

Status: complete.

## Completed

- Added core D1 schema migration in `0002_core_schema.sql`.
- Added schema constants for core tables, tenant-scoped tables, indexes, and enum values.
- Added D1 client helpers for prepared queries and SQLite binding normalization.
- Added metadata and schema repository helpers.
- Added schema contract tests.

## Important Files

- `apps/web/worker/db/migrations/0002_core_schema.sql`
- `apps/web/worker/db/schema.ts`
- `apps/web/worker/db/client.ts`
- `apps/web/worker/db/repositories/metadata.repository.ts`
- `apps/web/worker/db/repositories/schema.repository.ts`
- `apps/web/worker/db/schema.test.ts`
- `docs/cloudflare-rewrite-plan.md`

## Schema Decisions

- IDs are Worker-generated `TEXT`.
- Timestamps are Unix milliseconds in `INTEGER`.
- Money is persisted as integer minor units with `*_minor`.
- Product quantities and stock are persisted as integer milli-units with `*_milli`.
- Tenant-scoped tables include `organization_id`.
- Role values are `owner`, `admin`, `member`, `viewer`.
- Journal line one-sided debit/credit is enforced in SQL; full journal balancing remains a service-layer invariant.

## Tests Run

- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 14 files / 111 tests
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass
- Fresh D1 apply with `--persist-to /tmp/...`: pass
- `sqlite_master` checks for core tables/indexes: pass

## Next Phase

- Phase 3 custom auth:
  - Worker `/api/auth/register`
  - `/api/auth/login`
  - `/api/auth/logout`
  - `/api/auth/me`
  - `/api/auth/verify-email`
  - `/api/auth/forgot-password`
  - `/api/auth/reset-password`
  - session cookie and frontend auth provider migration

## Notes for Next Agent

- Supabase runtime code still exists intentionally.
- Authorization/permission middleware is not implemented yet; Phase 4 owns org membership enforcement.
