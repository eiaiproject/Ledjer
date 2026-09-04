# Production Documentation Index

Production operations documentation.

| Document | Purpose |
|----------|---------|
| [Monitoring](monitoring.md) | Error tracking, uptime monitoring, alerting setup |
| [Incident Response](incident-response.md) | How to handle production incidents |

## Related Documents

- [Accounting Rules](../accounting-rules.md) - Accounting correctness rules

## Status

Cloudflare Worker + D1 is the active production stack.

## Security Considerations

### Content Security Policy (CSP)

Production CSP is defined in `apps/web/index.html`. Known residual risks:

1. **`unsafe-inline` in `style-src`**: Required for Tailwind CSS dev HMR. Production build extracts styles to CSS files, but CSP still includes `unsafe-inline` as a safety net. Remove when Worker serves nonce'd HTML dynamically.

2. **Wildcard Sentry domain (`*.ingest.sentry.io`)**: Should be replaced with the project-specific ingest domain from `VITE_SENTRY_DSN`. Requires setting the DSN in `.env.local` and extracting the exact host.
