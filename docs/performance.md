# Performance Baseline

## Load Testing

Uses [k6](https://k6.io) for load and stress testing.

### Setup

```bash
brew install k6  # macOS
# Or: docker pull grafana/k6
```

### Run

```bash
# Landing page (light load)
k6 run load-tests/k6/landing.js

# Auth login burst
BASE_URL=https://ledjer.id k6 run load-tests/k6/auth.js

# Transaction creation
SESSION_COOKIE="__Host-ledjer_session=<token>" \
  CASH_ACCOUNT_ID="<id>" \
  k6 run load-tests/k6/transactions.js

# Reports (requires session)
SESSION_COOKIE="__Host-ledjer_session=<token>" k6 run load-tests/k6/reports.js

# Export endurance test
SESSION_COOKIE="__Host-ledjer_session=<token>" k6 run load-tests/k6/exports.js

# Mixed workload (simulates real user behavior)
SESSION_COOKIE="__Host-ledjer_session=<token>" k6 run load-tests/k6/mixed.js

# Sustained 30-min soak
SESSION_COOKIE="__Host-ledjer_session=<token>" k6 run load-tests/k6/sustained.js
```

> `load-tests/k6/` contains: `landing.js`, `auth.js`, `transactions.js`,
> `reports.js`, `exports.js`, `mixed.js`, `sustained.js`. All authenticated
> scenarios target the MVP endpoints (transactions, reports, dashboard,
> CSV export) and need a session cookie obtained from a real login.

### Checkpoints

After each run record:

| Metric | Target | Baseline |
|--------|--------|----------|
| p50 latency | <500ms | TBD |
| p95 latency | <2000ms | TBD |
| p99 latency | <5000ms | TBD |
| Error rate | <1% | TBD |
| Throughput | >100 req/s | TBD |

### SLOs

- Availability: >= 99.5%
- p95 API latency: < 2s (normal load), < 5s (spike)
- Error rate: < 1% of requests
- Export (CSV): < 10s for 10k rows
- Report generation: < 5s for 3-month period
