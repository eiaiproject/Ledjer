# Auth Flows

Ledjer uses Worker-native auth. Password hashes, sessions, verification tokens, and reset tokens live in Cloudflare D1.

## Register

```text
Browser -> POST /api/auth/register
Worker  -> create user + email verification token
Browser -> show email confirmation state
```

Email delivery can be wired through `EMAIL_API_KEY`; without a provider the token model still works for local/dev tests.

## Login

```text
Browser -> POST /api/auth/login
Worker  -> verify password, rate-limit attempts, create session
Worker  -> set HttpOnly session cookie
Browser -> GET /api/auth/me for current user
```

CSRF middleware protects mutating API routes. Session cookies are HttpOnly and same-site.

## Logout

```text
Browser -> POST /api/auth/logout
Worker  -> revoke current session
Worker  -> clear session cookie
```

## Password Recovery

```text
Browser -> POST /api/auth/password-reset/request
Worker  -> create reset token when email exists
Browser -> generic success response
Browser -> /reset-password?token=...
Browser -> POST /api/auth/password-reset/confirm
Worker  -> update password and consume token
```

The request endpoint returns a generic success response to prevent account enumeration.

## Related Code

| Area | Path |
|------|------|
| Auth routes | `apps/web/worker/routes/auth.routes.ts` |
| Auth service | `apps/web/worker/services/auth.service.ts` |
| Session service | `apps/web/worker/services/session.service.ts` |
| Frontend auth context | `apps/web/src/contexts/auth-context.tsx` |
| Login/register/reset pages | `apps/web/src/pages/` |
