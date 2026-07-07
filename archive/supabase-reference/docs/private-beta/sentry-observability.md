# Sentry & Observability — Private Beta

## Current State

Sentry is already integrated. The frontend conditionally initializes Sentry:

```typescript
// apps/web/src/main.tsx
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ ... });
}
```

- **Disabled** when `VITE_SENTRY_DSN` is empty/missing — no errors sent.
- **Enabled** when `VITE_SENTRY_DSN` is set — browser errors, traces, replay captured.
- CSP already allows `https://*.ingest.sentry.io` in all three CSP locations (index.html, _headers, vercel.json).

## Enabling Sentry for Private Beta

### 1. Create Sentry Project

1. Go to [sentry.io](https://sentry.io) → Create new project → React.
2. Note the **DSN** (format: `https://<key>@sentry.io/<project-id>`).

### 2. Set DSN in Hosting

In your hosting platform dashboard:

```
VITE_SENTRY_DSN=https://<key>@sentry.io/<project-id>
```

### 3. Configure Sentry Dashboard

Sentry project → Settings:

- [ ] **Alerts → Create Alert Rule:**
  - Error spike: ≥ 10 errors in 5 minutes
  - New issue notification
  - Performance regression (P95 latency > 2s)

- [ ] **Releases → Create Release:**
  - Source maps upload (optional — requires `SENTRY_AUTH_TOKEN` in CI)
  - Release naming: match deployment version or commit SHA

### 4. Optional: Source Maps Upload

If source maps are uploaded in CI, add these GitHub secrets:

```
SENTRY_ORG=<your-org>
SENTRY_PROJECT=<your-project>
SENTRY_AUTH_TOKEN=<auth-token-from-sentry>
```

**Do not** set `SENTRY_AUTH_TOKEN` in frontend hosting — it is server-side only.

## What Sentry Captures

| Feature | Sample Rate | Notes |
|---------|-------------|-------|
| Browser errors | 100% | Unhandled exceptions, promise rejections |
| Performance traces | 10% | Adjust via `tracesSampleRate` in `main.tsx` |
| Session replay | 5% session, 100% on error | Via `replayIntegration()` |

## Other Observability for Private Beta

Sentry covers frontend errors. For complete observability:

| Area | Tool | Setup |
|------|------|-------|
| Frontend errors | Sentry | Set `VITE_SENTRY_DSN` |
| API errors / slow queries | Supabase Dashboard | Database → Logs, API → Logs |
| Auth failures | Supabase Dashboard | Authentication → Logs |
| RPC errors | Application logs | Check `post_transaction` / RPC error responses in Sentry breadcrumbs |
| Uptime | External service | UptimeRobot / Checkly — monitor `https://ledjer.id` (HTTP 200, 5-min interval) |
| Incident response | Contact path | Define who to contact (Supabase support, hosting support, Sentry alerts) |

## No Sentry Token Exposure

- `VITE_SENTRY_DSN` is a public key — safe for browser.
- `SENTRY_AUTH_TOKEN` is for CI source-map upload only — never in frontend code.
