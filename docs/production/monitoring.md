# Monitoring & Data Retention — Ledjer

## Table Retention

| Table                  | Retention     | Policy                            |
|------------------------|---------------|-----------------------------------|
| sessions               | Until expiry  | Deleted when `expires_at <= now`  |
| email_verifications    | Until use     | Deleted when `used_at IS NOT NULL` or expired |
| password_reset_tokens  | Until use     | Deleted when `used_at IS NOT NULL` or expired |
| export_jobs            | Configurable  | Deleted when `expires_at` passed  |
| login_attempts         | 90 days       | Configured in `cleanupExpiredRows` |
| audit_logs             | 7 years       | Configured via `AUDIT_RETENTION_DAYS` env |

The daily cron trigger at 03:00 WIB runs `cleanupExpiredRows` to purge expired rows.

## Observability

- Sentry: errors captured via `@sentry/cloudflare` in the Worker entry point.
- Structured logs: request bodies logged as JSON to stdout (password fields redacted).
- Health endpoint: `GET /api/health` returns 503 when DB unreachable.
