# CSRF Protection

## Current Implementation

Ledjer uses Origin-based CSRF protection for all state-changing methods
(POST, PUT, PATCH, DELETE) on `/api/*` routes.

### How it works

1. For state-changing methods, `Origin` (fallback `Referer`) is checked — `c.req.header("Origin") || c.req.header("Referer")`.
2. If present, its `URL.origin` (scheme+host+port, path stripped) must exactly match one entry in `APP_ORIGIN` (comma-separated). `Referer` with path like `https://ledjer.id/dashboard` is accepted because `new URL(referer).origin === "https://ledjer.id"`.
3. If absent and a session cookie is present, the request is rejected with 403.
4. If absent and no session cookie, the request proceeds (public API, e.g. health check / pre-auth login).

### Configuration

- `APP_ORIGIN` environment variable: comma-separated allowed origins.
  Example: `https://ledjer.id,http://localhost:5173,http://localhost:4173`
- In production, `APP_ORIGIN` must be set. If unset, production denies all
  origins with a 500 error.

### Non-browser API clients

API clients that cannot send `Origin` header must authenticate differently:
- Use the existing cookie-based flow (browser-like) with an explicit `Origin` header.
- Future: API key authentication for machine-to-machine access.

### Verified Behaviors

| Scenario | Expected | Status |
|----------|----------|--------|
| POST with valid Origin + session cookie | Passes CSRF (may fail auth) | ✅ Tested |
| POST with invalid Origin + session cookie | 403 | ✅ Tested |
| POST with missing Origin + session cookie | 403 | ✅ Tested |
| POST without Origin and without cookie | Passes (public endpoint) | ✅ Tested |
| GET/OPTIONS/HEAD requests | Pass unconditionally | ✅ Tested |

### Negative Tests

See `e2e/csrf.spec.ts` for automated Playwright CSRF tests.
