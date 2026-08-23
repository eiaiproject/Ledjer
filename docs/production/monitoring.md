# Monitoring

## Current State

- **Error tracking**: Sentry (Cloudflare + React) — captures unhandled exceptions.
- **Logging**: Structured JSON via `console.log` — captured by Cloudflare Workers logs.
- **Health check**: `GET /api/health` — returns 200 when Worker is operational.
- **Scheduled cron**: Daily maintenance at 03:00 UTC (10:00 WIB) — see `wrangler.jsonc` crons `0 3 * * *` (UTC).

## Structured Logging

All API requests log structured JSON entries:

```json
{
  "time": "2026-07-17T08:00:00.000Z",
  "level": "info",
  "method": "GET",
  "path": "/api/accounts",
  "query": "type=asset",
  "status": 200,
  "duration": 45,
  "requestId": "uuid",
  "env": "production",
  "version": "abc123"
}
```

## Backup Age Alert

The daily D1 backup cron runs at 03:00 UTC (10:00 WIB). Configure an alert on:

- **Metric**: `backup_age_hours` — hours since last successful backup.
- **Warning**: > 26 hours (missed one cycle).
- **Critical**: > 50 hours (missed two cycles).
- **Check**: Query R2 bucket `ledjer-backups` for latest object key, compare timestamp.

```bash
# Manual check
npx wrangler r2 object list ledjer-backups --prefix ledjer-production/ --limit 1
```

## Metrics to Collect

| Metric | Source | Type |
|--------|--------|------|
| Request count | Worker logs | Counter |
| p50/p95/p99 latency | Worker logs | Histogram |
| Error rate (5xx) | Worker logs | Gauge |
| Auth failure rate | Worker logs | Gauge |
| Rate-limit hits | Worker logs | Gauge |
| D1 query errors | Sentry | Counter |
| Export requests | Worker logs | Counter |
| Cron success/failure | Worker logs | Gauge |

## Initial SLOs

| SLO | Target | Measurement | Window |
|-----|--------|-------------|--------|
| Availability | ≥ 99.5% | Health check pass rate | 30 days |
| API p95 latency | < 2000ms | Request duration | 30 days |
| Error rate | < 1% | 5xx / total requests | 30 days |
| Backup age | < 36 hours | Time since last backup | Daily |

## Alerts

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| High error rate | > 5% 5xx in 5 min | Critical | Incident response |
| High latency | p95 > 3000ms in 5 min | Warning | Investigate |
| Auth failure spike | > 10x baseline in 5 min | Warning | Check for brute force |
| Backup too old | Last backup > 36h | Critical | Run backup manually |
| D1 errors | Any in 5 min | Warning | Check D1 status |
| Cron failure | 3 consecutive failures | Warning | Investigate |

## Dashboard (Recommended)

Create a Cloudflare Dashboard or Grafana dashboard with:
1. Request rate (rps) by route
2. p50/p95/p99 latency
3. Error rate by status code
4. Auth success vs failure
5. Active organizations
6. Export volume
7. Backup age
