# Tenant Isolation Architecture

## Overview

Ledjer uses a **shared-database, shared-schema** multi-tenancy model. All tenant data lives in the same D1 database and the same tables. Isolation is enforced at the application layer through:

1. **Session-bound organization context** — every authenticated request has a `current_organization_id` stored in the session.
2. **Middleware enforcement** — `loadCurrentOrganization()` loads the org context and `requirePermission()` checks role-based access before any handler runs.
3. **SQL-level scoping** — every query against tenant-owned data must include `WHERE organization_id = ?`.
4. **`TenantScopedRepository`** — a query wrapper that throws at runtime if a tenant-scoped table is queried without a valid `organization_id` binding.

## Tenant-Scoped Tables

These tables contain data owned by a specific organization:

- `accounts`, `parties`, `products`
- `transactions`, `transaction_lines`
- `journal_entries`, `journal_lines`
- `stock_movements`
- `period_locks`
- `organization_members`, `organization_invitations`
- `organization_document_counters`
- `audit_logs`

## Non-Tenant Tables

These tables are global across all tenants:

- `users`, `sessions`, `email_verifications`, `password_reset_tokens`
- `login_attempts`, `oauth_accounts`
- `organizations` (the org entity itself)
- `app_metadata`, `rate_limits`

## Enforcement Layers

### 1. Authentication (`requireAuth`)
Reads the session cookie (`__Host-ledjer_session` in production, `ledjer_session` in dev). Returns 401 if missing, expired, or revoked.

### 2. Organization Context (`loadCurrentOrganization`)
Resolves `current_organization_id` from the session. Loads the organization and the user's membership. Returns 403 if org not found or user not a member.

### 3. Permission Check (`requirePermission`)
Verifies the member's role has the required permission for the operation. Returns 403 if insufficient.

### 4. Query Scoping
All service functions accept `organizationId` as the first parameter and include it in every SQL `WHERE` clause. The `TenantScopedRepository` provides a runtime guard.

## Verification

- **Unit tests**: `worker/__tests__/tenant-isolation.test.ts` — validates `TenantScopedRepository` enforcement.
- **E2E tests**: `e2e/tenant-isolation.spec.ts` — validates cross-tenant access returns 403.
- **Permission matrix**: `docs/architecture/permission-matrix.md` — documents every route's required middleware.

## Incident Response

If a cross-tenant data access is detected:
1. **Immediately** revoke the affected session(s).
2. **Investigate** which data was exposed (audit logs, request logs).
3. **Notify** affected tenants within 72 hours (per UU PDP).
4. **Fix** the scoping gap and add a regression test.
5. **Document** in postmortem.
