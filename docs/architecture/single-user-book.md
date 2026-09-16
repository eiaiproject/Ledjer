# Single-User Book Scoping (MVP)

## Overview

Ledjer is **one account = one book**. There is no organization or membership
layer: a user's rows are their book, and the `user_id` column is the only scope
column. Multi-tenant scoping (`organization_id`, `current_organization_id`,
`memberships`) was removed by migration `0009_single_user.sql`.

Isolation is enforced at the application layer:

1. **Session-bound user context** - `requireAuth()` resolves the session cookie
   to a `user_id`; there is no separate tenant context to load.
2. **SQL-level scoping** - every query against book data must include
   `user_id = ?` (or join through a user-scoped row). Services receive
   `userId` as their first argument.
3. **`UserScopedRepository`** (`worker/db/user-scoped.repository.ts`) - a query
   wrapper that throws at runtime when a user-scoped table is queried without a
   `user_id` binding.
4. **CI guard** - `scripts/check-user-scoping.sh` greps `worker/services/*.ts`
   for SELECT/UPDATE/DELETE statements missing `user_id`.

## User-Scoped Tables

Owned by a single book (must always be queried with `user_id`):

- `accounts`
- `products`
- `transactions`
- `journal_entries`
- `journal_lines`
- `stock_movements`
- `audit_logs`

The list lives in `worker/db/schema.ts` (`USER_SCOPED_TABLES`) and is the source
of truth for `UserScopedRepository`.

## Non-Scoped (Global) Tables

Not scoped by `user_id` in queries:

- `app_metadata`, `rate_limits`
- `users`, `sessions` (auth identity itself)
- `oauth_accounts`

## Enforcement Layers

1. **Authentication** (`requireAuth`): reads the session cookie
   (`__Host-ledjer_session` in production, `ledjer_session` in dev). 401 when
   missing/expired/revoked. Sets `session.user_id`; that value is the scope for
   every downstream query.
2. **Query scoping**: all service functions filter by `userId`; the CI script
   `scripts/check-user-scoping.sh` greps for unscoped queries, and
   `UserScopedRepository` adds a runtime guard.
3. **Business name**: `organizations.name` became `users.business_name`,
   read/updated through `GET`/`PATCH /api/auth/me`.

## Verification

- Unit tests: `apps/web/worker/__tests__/user-isolation.test.ts` exercises the
  `UserScopedRepository` guard; `cross-user.test.ts` and service tests (e.g.
  `reports.service.test.ts`, `transactions.service.test.ts`) assert that user B
  never sees user A data.
- Migration test: `worker/db/single-user-migration.test.ts` upgrades a
  multi-tenant database and checks the backfill, dropped tables, per-user
  uniqueness, and `PRAGMA foreign_key_check`.
- E2E: scoping is covered indirectly — every authenticated e2e spec runs under a
  single session and would surface leaks.
- Permission matrix: `docs/architecture/permission-matrix.md` documents every
  route and its required middleware.

## Incident Response

If cross-user access is ever suspected:

1. Immediately revoke the affected session(s) (`sessions.revoked_at`).
2. Investigate scope of exposure using `audit_logs` and structured request
   logs (correlated by `requestId`).
3. Notify affected users within 72 hours (UU PDP).
4. Fix the scoping gap and add a regression test; document in a postmortem.
