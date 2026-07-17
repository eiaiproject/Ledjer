# Permission Matrix

## Roles and Permissions

| Permission | Owner | Admin | Member | Viewer |
|------------|-------|-------|--------|--------|
| organization:read | ✓ | ✓ | ✓ | ✓ |
| organization:update | ✓ | ✓ | | |
| accounts:read | ✓ | ✓ | ✓ | ✓ |
| accounts:write | ✓ | ✓ | | |
| products:read | ✓ | ✓ | ✓ | ✓ |
| products:write | ✓ | ✓ | | |
| transactions:read | ✓ | ✓ | ✓ | ✓ |
| transactions:create | ✓ | ✓ | ✓ | |
| transactions:void | ✓ | ✓ | | |
| reports:read | ✓ | ✓ | ✓ | ✓ |
| team:read | ✓ | ✓ | ✓ | ✓ |
| team:manage | ✓ | ✓ | | |
| exports:create | ✓ | ✓ | | |

## Route Protection Audit

| Route Pattern | requireAuth | loadCurrentOrg | requirePermission | Notes |
|---------------|-------------|----------------|-------------------|-------|
| GET /api/health | — | — | — | Public |
| POST /api/auth/register | — | — | — | Public, rate-limited |
| POST /api/auth/login | — | — | — | Public, rate-limited |
| POST /api/auth/logout | — | — | — | Reads session if present |
| GET /api/auth/me | — | — | — | Returns null if no session |
| POST /api/auth/verify-email | — | — | — | Token-based auth |
| POST /api/auth/resend-verification | — | — | — | Rate-limited |
| POST /api/auth/forgot-password | — | — | — | Rate-limited |
| POST /api/auth/reset-password | ✓ | — | — | Via session |
| POST /api/auth/change-password | ✓ | — | — | Via session |
| GET /api/auth/google/* | — | — | — | OAuth flow |
| GET /api/organizations | ✓ | — | — | Lists user's orgs |
| POST /api/organizations | ✓ | — | — | Creates new org |
| GET /api/organizations/current | ✓ | ✓ | organization:read | |
| PUT /api/organizations/current | ✓ | ✓ | organization:update | |
| POST /api/organizations/switch | ✓ | — | — | Changes current_org |
| GET /api/accounts | ✓ | ✓ | accounts:read | |
| GET /api/accounts/:id | ✓ | ✓ | accounts:read | |
| POST /api/accounts | ✓ | ✓ | accounts:write | |
| PATCH /api/accounts/:id | ✓ | ✓ | accounts:write | |
| GET /api/parties | ✓ | ✓ | accounts:read | |
| POST /api/parties | ✓ | ✓ | accounts:write | |
| GET /api/products | ✓ | ✓ | products:read | |
| GET /api/products/:id | ✓ | ✓ | products:read | |
| POST /api/products | ✓ | ✓ | products:write | |
| PATCH /api/products/:id | ✓ | ✓ | products:write | |
| GET /api/inventory/movements | ✓ | ✓ | products:read | |
| GET /api/transactions | ✓ | ✓ | transactions:read | |
| GET /api/transactions/:id | ✓ | ✓ | transactions:read | |
| POST /api/transactions | ✓ | ✓ | transactions:create | Idempotency key |
| POST /api/transactions/:id/void | ✓ | ✓ | transactions:void | |
| POST /api/transactions/:id/settle | ✓ | ✓ | transactions:create | |
| GET /api/reports/* | ✓ | ✓ | reports:read | |
| GET /api/team | ✓ | ✓ | team:read | |
| POST /api/team/invitations | ✓ | ✓ | team:manage | |
| PATCH /api/team/members/:id | ✓ | ✓ | team:manage | |
| DELETE /api/team/members/:id | ✓ | ✓ | team:manage | |
| POST /api/team/invitations/:id/revoke | ✓ | ✓ | team:manage | |
| GET /api/exports/* | ✓ | ✓ | exports:create | |
| GET /api/audit-logs | ✓ | ✓ | team:read | Owner/admin only via service |
| GET /api/dashboard/* | ✓ | ✓ | reports:read | |
| GET /api/period-locks | ✓ | ✓ | accounts:write | |
| POST /api/period-locks | ✓ | ✓ | accounts:write | |
| DELETE /api/period-locks/:id | ✓ | ✓ | accounts:write | |

## Implementation

- `requireAuth()`: Reads session cookie, resolves user. Sets `c.get("session")` and `c.get("user")`.
- `loadCurrentOrganization()`: Loads org context from session's `current_organization_id`. Sets `c.get("organizationContext")`.
- `requirePermission(permission)`: Checks `ROLE_PERMISSIONS[member.role]` for the required permission. Throws 403 if missing.

### Error Responses

- 401 Unauthorized: `{ error: { code: "unauthorized", message: "Unauthorized", requestId } }`
- 403 Forbidden: `{ error: { code: "permission_denied", message: "Permission denied", requestId } }`
- 403 Organization required: `{ error: { code: "organization_required", message: "Organization membership is required", requestId } }`
