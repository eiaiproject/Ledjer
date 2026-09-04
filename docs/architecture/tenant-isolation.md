# Tenant Isolation Architecture (MVP)

## Overview

Ledjer uses a **shared-database, shared-schema** multi-tenancy model: all
organizations share one D1 database and the same tables. Isolation is enforced
at the application layer:

1. **Session-bound organization context** - the session stores the
   `current_organization_id`; every request resolves its tenant from there.
2. **Middleware enforcement** - `loadCurrentOrganization()` loads the org +
   membership before any protected handler runs; `requirePermission()` gates
   role access (see [permission-matrix.md](permission-matrix.md)).
3. **SQL-level scoping** - every query against tenant data must include
   `organization_id = ?` (or join through a tenant-scoped row). Services receive
   `organizationId` as their first argument.
4. **`TenantScopedRepository`** (`worker/db/tenant-scoped.repository.ts`) - an
   optional query wrapper that throws at runtime when a tenant-scoped table is
   queried without an `organization_id` binding.

## Tenant-Scoped Tables

Owned by a single organization (must always be queried with `organization_id`):

- `memberships`
- `accounts`
- `transactions`
- `journal_entries`
- `journal_lines`
- `audit_logs`

The list lives in `worker/db/schema.ts` (`TENANT_SCOPED_TABLES`) and is the
source of truth for `TenantScopedRepository`.

## Non-Tenant (Global) Tables

Shared across tenants - never tenant-scoped in queries:

- `users`, `sessions`, `rate_limits`
- `oauth_accounts`
- `organizations` (the tenant entity itself; the row is selected by id from the
  session's `current_organization_id`, not filtered by an org column)
- `app_metadata`

## Enforcement Layers

1. **Authentication** (`requireAuth`): reads the session cookie
   (`__Host-ledjer_session` in production, `ledjer_session` in dev). 401 when
   missing/expired/revoked.
2. **Organization context** (`loadCurrentOrganization`): resolves
   `current_organization_id` from the session and loads the org + membership.
   403 `organization_required` when the user belongs to no org.
3. **Permission check** (`requirePermission`): verifies the member's role owns
   the required permission. Single role in MVP: `owner`.
4. **Query scoping**: all service functions filter by `organizationId`; the CI
   script `scripts/check-org-scoping.sh` greps for unscoped queries on
   tenant-scoped tables, and `TenantScopedRepository` adds a runtime guard.

## Verification

- Unit tests: `apps/web/worker/__tests__/tenant-isolation.test.ts` exercises
  the `TenantScopedRepository` guard; `cross-tenant.test.ts` and service tests
  (e.g. `reports.service.test.ts`, `transactions.service.test.ts`) assert that
  Org B never sees Org A data.
- E2E: `apps/web/e2e/tenant-isolation.spec.ts` verifies cross-tenant access is
  rejected at the HTTP layer.
- Permission matrix: `docs/architecture/permission-matrix.md` documents every
  route and its required middleware.

## Incident Response

If cross-tenant access is ever suspected:

1. Immediately revoke the affected session(s) (`sessions.revoked_at`).
2. Investigate scope of exposure using `audit_logs` and structured request
   logs (correlated by `requestId`).
3. Notify affected tenants within 72 hours (UU PDP).
4. Fix the scoping gap and add a regression test; document in a postmortem.
