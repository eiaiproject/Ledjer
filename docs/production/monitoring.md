# Production Monitoring & Observability

Last updated: 2026-07-31

## Error Tracking — Sentry

**Status:** ✅ Configured (behind `VITE_SENTRY_DSN`)

- Frontend errors tracked via `@sentry/react`
- Performance traces at 10% sampling
- CSP allows Sentry ingest (`connect-src: https://*.ingest.sentry.io`)
- Replay integration: `maskAllText: true`, `blockAllMedia: true`, `maskAllInputs: true` — PII masked
- `beforeSend` sanitization: URL query params/hash stripped; `request.headers` scrubbed (Authorization, Cookie, Set-Cookie, x-auth-token, api-key)

### Required Setup
1. Create Sentry project at sentry.io
2. Set `VITE_SENTRY_DSN` in production env
3. Configure alerts in Sentry dashboard:
   - Error spike: ≥10 errors in 5 min
   - New error type notification
   - Performance regression: P95 latency > 2s

## Uptime Monitoring

**Status:** ⚠️ Not configured — requires setup

### Recommended Tools
- UptimeRobot (free tier available)
- Checkly (browser-level checks)

### What to Monitor
| URL | Check Type | Interval |
|-----|-----------|----------|
| `https://ledjer.id` | HTTP 200 | 5 min |
| `https://ledjer.id/login` | Page load | 15 min |

### Alert Contacts
- Primary: [owner email]
- Secondary: [backup email]

## Worker/D1 Health

**Status:** ⚠️ Manual monitoring via Cloudflare dashboard

### Key Metrics to Watch
- Worker error rate and latency
- D1 query failures
- D1 storage and write volume
- Auth failure rate
- Auth failure rate

## Auth Monitoring

- Login attempts tracked in `login_attempts` table
- Rate limiting active on auth endpoints
- Failed login alerts: configure in Supabase dashboard

## Frontend Performance

- Sentry traces capture page load, navigation, and API call timing
- Performance E2E tests cover Web Vitals (`e2e/performance.spec.ts`, `pnpm test:perf`)

## Log Aggregation

**Status:** ⚠️ Not configured

For production, consider:
- Cloudflare Worker logs
- Sentry frontend errors
- Structured server logging when added

## Alerting Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| Frontend error spike | High | Check Sentry, investigate |
| D1 query failures | Critical | Check Worker logs and recent migrations |
| Auth failure spike | Medium | Check for brute force |
| Uptime check failure | Critical | Investigate service status |
| Slow query > 5s | Medium | Optimize or add index |
| Disk usage > 80% | High | Clean up or scale |
