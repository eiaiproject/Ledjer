# Route Protection Matrix (MVP)

## Authorization Model

Satu akun = satu buku. There is **no role system**: the signed-in user owns
their book outright, so there is no membership, no `ROLE_PERMISSIONS` table, and
no `organization:*` permission. Anything the API exposes under `/api/*` is
authorized by authentication plus `user_id` scoping — see
[single-user-book.md](single-user-book.md).

## Route Protection Audit

Every route under `/api/*` first passes the CSRF origin check
(`worker/index.ts`, see [csrf](../security/csrf.md)) and then
`requireAuth()` where listed. Actions further scope queries to
`session.user_id`.

| Route | Auth | Notes |
|-------|------|-------|
| GET /api/health, /api/health/ready | - | Public |
| GET /api/metrics, /api/metrics/detailed | - | Public, in-memory counters |
| POST /api/auth/register | - | Rate-limited (5/15 min/IP); creates user + default COA |
| POST /api/auth/login | - | Rate-limited (10/15 min/IP+email) |
| POST /api/auth/logout | - | Revokes session if present |
| GET /api/auth/me | - | Session read; returns `null` when absent |
| PATCH /api/auth/me | ✓ | Update `business_name` (dulu `organization.name`) |
| GET /api/auth/google/start | - | OAuth entry; requires GOOGLE_CLIENT_ID/SECRET |
| GET /api/auth/google/callback | - | OAuth callback (state-cookie CSRF) |
| GET /api/accounts | ✓ | `includeInactive`, `subtype` filters |
| POST /api/accounts/cash-bank | ✓ | Create cash/bank account |
| PATCH /api/accounts/:id | ✓ | Rename / toggle active |
| GET /api/products | ✓ | List (active only by default) |
| POST /api/products | ✓ | Create product |
| PATCH /api/products/:id | ✓ | Rename / price / toggle active |
| GET /api/transactions | ✓ | List + count, filters |
| POST /api/transactions | ✓ | Idempotency key; rate-limited |
| GET /api/transactions/:id | ✓ | |
| POST /api/transactions/:id/void | ✓ | Rate-limited |
| GET /api/reports/profit-loss | ✓ | Date range required |
| GET /api/reports/balance-sheet | ✓ | As-of date required |
| GET /api/reports/general-ledger | ✓ | Date range; optional accountId |
| GET /api/dashboard/summary | ✓ | |
| GET /api/dashboard/alerts | ✓ | Negative cash/bank balances |
| GET /api/exports/transactions.csv | ✓ | CSV, 50k row cap |

> Routes that never existed in the MVP scope (organizations, memberships, team,
> invitations, period locks, parties, attachments, imports, push) do not exist;
> requests hit the 404 handler.

## Middleware Semantics

- `requireAuth()`: reads the session cookie (`__Host-ledjer_session` in
  production, `ledjer_session` otherwise). Returns 401 when missing, revoked, or
  expired; sets `c.get("session")` and `c.get("user")`. Session tokens are
  rotated server-side after 7 days (new token set as a cookie).

### Error Responses

- 401: `{ error: { code: "unauthorized", message, requestId } }`
- 403: `{ error: { code: "csrf_invalid", ... } }`

All errors share one envelope: `{ error: { code, message, requestId } }`
(`worker/http/errors.ts` + `middleware/error.middleware.ts`).
