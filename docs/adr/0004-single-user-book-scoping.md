# ADR 0004: Single-User Book Scoping

**Date:** 2026-09-16
**Status:** Accepted
**Deciders:** Engineering team

## Context

The MVP shipped as shared-schema multi-tenancy: every book-scoped table carried
`organization_id`, sessions carried `current_organization_id`, and
`memberships` mapped users to organizations with a single `owner` role. The
product is used by one person per business, so the org layer only added
indirection: a membership lookup on every request, a role check that could never
fail, and a second scope column (`transactions.created_by`) that duplicated the
org owner.

## Decision

Collapse to **one account = one book**:

- `user_id` becomes the only scope column on book-scoped tables
  (`accounts`, `products`, `transactions`, `journal_entries`, `journal_lines`,
  `stock_movements`, `audit_logs`).
- `transactions.created_by` was renamed to `user_id` rather than keeping two
  owner columns.
- `organizations` and `memberships` are dropped; `organizations.name` becomes
  `users.business_name`, read/written through `GET`/`PATCH /api/auth/me`.
- `sessions.current_organization_id` is dropped.
- The `loadCurrentOrganization()` / `requirePermission()` middleware is removed;
  `requireAuth()` plus `user_id` scoping is the whole authorization story.
- `TenantScopedRepository` becomes `UserScopedRepository`, and the CI guard
  becomes `scripts/check-user-scoping.sh`.

Migration `0009_single_user.sql` performs the change forward-only: it backfills
`user_id` from each row's owning membership, rebuilds affected tables (SQLite
rejects `DROP COLUMN` on columns used in FK definitions), re-scopes indexes and
uniqueness to `user_id`, then drops the org tables.

## Consequences

- Positive: one scope column, one index prefix (`idx_*_user_*`), no membership
  join on the request path.
- Positive: per-user uniqueness (account code, product code, transaction
  number) is a direct table constraint instead of an org-plus-code pair.
- Negative: re-introducing teams later needs a new forward-only migration and a
  scope column, not just a new role row.
- Negative: `0001`-`0008` still describe the org schema; they are historical and
  must be read together with `0009`.
