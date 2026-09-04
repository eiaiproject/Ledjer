# Permission Matrix (MVP)

## Roles

The MVP has a single role: **`owner`**. `owner` holds every permission; the
membership row also exposes boolean capability flags (`can_create_transaction`,
`can_view_reports`, `can_manage_accounts`, `can_void_transaction`) that the
frontend reads for UI gating - all true for `owner`.

Permissions are defined as a `Permission` union in
`worker/services/organization.service.ts` (`ROLE_PERMISSIONS`) and enforced by
the `requirePermission(...)` middleware:

| Permission | Owner |
|------------|-------|
| organization:read | ✓ |
| organization:update | ✓ |
| accounts:read | ✓ |
| accounts:write | ✓ |
| transactions:read | ✓ |
| transactions:create | ✓ |
| transactions:void | ✓ |
| reports:read | ✓ |
| exports:create | ✓ |

## Route Protection Audit

Every route under `/api/*` first passes the CSRF origin check
(`worker/index.ts`, see [csrf](../security/csrf.md)) and then the middleware
below. Order per route group: `requireAuth()` →
`loadCurrentOrganization()` → `requirePermission(...)`.

| Route | Auth | Org | Permission | Notes |
|-------|------|-----|------------|-------|
| GET /api/health, /api/health/ready | - | - | - | Public |
| GET /api/metrics, /api/metrics/detailed | - | - | - | Public, in-memory counters |
| POST /api/auth/register | - | - | - | Rate-limited (5/15 min/IP) |
| POST /api/auth/login | - | - | - | Rate-limited (10/15 min/IP+email) |
| POST /api/auth/logout | - | - | - | Revokes session if present |
| GET /api/auth/me | - | - | - | Session read; returns null when absent |
| GET /api/auth/google/start | - | - | - | OAuth entry; requires GOOGLE_CLIENT_ID/SECRET |
| GET /api/auth/google/callback | - | - | - | OAuth callback (state-cookie CSRF) |
| GET /api/organizations/current | ✓ | - | - | Resolves session org manually |
| PATCH /api/organizations/current | ✓ | ✓ | organization:update | |
| GET /api/accounts | ✓ | ✓ | accounts:read | `includeInactive`, `subtype` filters |
| POST /api/accounts/cash-bank | ✓ | ✓ | accounts:write | Create cash/bank account |
| PATCH /api/accounts/:id | ✓ | ✓ | accounts:write | Rename / toggle active |
| GET /api/transactions | ✓ | ✓ | transactions:read | List + count, filters |
| POST /api/transactions | ✓ | ✓ | transactions:create | Idempotency key; rate-limited |
| GET /api/transactions/:id | ✓ | ✓ | transactions:read | |
| POST /api/transactions/:id/void | ✓ | ✓ | transactions:void | Rate-limited |
| GET /api/reports/profit-loss | ✓ | ✓ | reports:read | Date range required |
| GET /api/reports/balance-sheet | ✓ | ✓ | reports:read | As-of date required |
| GET /api/reports/general-ledger | ✓ | ✓ | reports:read | Date range; optional accountId |
| GET /api/dashboard/summary | ✓ | ✓ | reports:read | |
| GET /api/dashboard/alerts | ✓ | ✓ | reports:read | Negative cash/bank balances |
| GET /api/exports/transactions.csv | ✓ | ✓ | exports:create | CSV, 50k row cap |

> Routes removed with the pre-MVP scope (products, parties, inventory, team,
> invitations, period locks, audit logs, attachments, imports, push) do not
> exist; requests hit the 404 handler.

## Middleware Semantics

- `requireAuth()`: reads the session cookie (`__Host-ledjer_session` in
  production, `ledjer_session` otherwise). Returns 401 when missing, revoked, or
  expired; sets `c.get("session")` and `c.get("user")`. Session tokens are
  rotated server-side after 7 days (new token set as a cookie).
- `loadCurrentOrganization()`: resolves the membership from the session's
  `current_organization_id`. Returns 403 `organization_required` when the user
  has no membership.
- `requirePermission(p)`: checks `ROLE_PERMISSIONS[member.role]`. Returns 400
  `permission_denied` when absent (single-role MVP: never fires for owners).

### Error Responses

- 401: `{ error: { code: "unauthorized", message, requestId } }`
- 403: `{ error: { code: "organization_required" | "csrf_invalid", ... } }`
- 400: `{ error: { code: "permission_denied", ... } }`

All errors share one envelope: `{ error: { code, message, requestId } }`
(`worker/http/errors.ts` + `middleware/error.middleware.ts`).
