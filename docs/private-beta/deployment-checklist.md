# Deployment Checklist — Private Beta

## Required Secrets

### Hosting Platform (Vercel / Cloudflare Pages / Netlify)

| Variable | Source | Notes |
|----------|--------|-------|
| `VITE_SUPABASE_URL` | Supabase dashboard → Settings → API | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API | Public anon key |
| `VITE_SENTRY_DSN` | Sentry project settings | Optional — enables error tracking |

### GitHub Actions (CI)

| Secret | When Needed | Notes |
|--------|-------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | E2E tests, visual regression | Never in frontend hosting |

### Supabase Project

| Setting | Location | Value |
|---------|----------|-------|
| Site URL | Dashboard → Auth → Settings | `https://ledjer.id` (future); currently `https://ledjer-ahk.pages.dev` |
| Redirect URLs | Dashboard → Auth → Settings | `https://ledjer-ahk.pages.dev`, `https://ledjer-ahk.pages.dev/auth/callback`, `https://ledjer.id`, `https://ledjer.id/auth/callback` (future) |
| SMTP | Dashboard → Auth → SMTP | Configured for email confirmation |

### Supabase Edge Functions

| Setting | Value | Notes |
|---------|-------|-------|
| `mayar-create-checkout` | `verify_jwt = true` (in `config.toml`) | Requires authenticated user |
| `mayar-webhook` | `verify_jwt = false` (in `config.toml`) | Uses mandatory `MAYAR_WEBHOOK_TOKEN` instead |

## Required Domains

| Domain | Purpose | DNS |
|--------|---------|-----|
| `ledjer-ahk.pages.dev` | Cloudflare Pages default domain | Managed by Cloudflare |
| `ledjer.id` (future) | Frontend hosting custom domain | CNAME to Cloudflare Pages |
| `<project>.supabase.co` | Supabase backend | Managed by Supabase |

## Pre-Deploy Checks

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Typecheck
pnpm --filter web typecheck

# 3. Lint
pnpm --filter web lint

# 4. Unit tests
pnpm --filter web test

# 5. Production build
pnpm --filter web build

# 6. DB types in sync
pnpm db-types:check
```

All must pass before merging to `main`.

## Post-Deploy Smoke Checks

After deploy completes:

1. [ ] Open `https://ledjer-ahk.pages.dev` (or `https://ledjer.id` after Cloudflare setup) — landing page loads.
2. [ ] Navigate to `/login` — login form visible.
3. [ ] Navigate to `/register` — register form visible.
4. [ ] Submit login with valid credentials — redirects to `/dashboard`.
5. [ ] Create a test transaction — transaction appears in list.
6. [ ] Navigate to `/settings/billing` — billing page loads (logged in).
7. [ ] Check browser console — no "Konfigurasi Belum Lengkap" error.
8. [ ] Check Sentry dashboard — if DSN is set, verify events arrive.
9. [ ] Verify security headers (DevTools → Network → Response Headers):
   - `Content-Security-Policy` present (no localhost origins)
   - `Strict-Transport-Security` present
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`

### Edge Function Smoke Checks

1. [ ] Verify `mayar-create-checkout` returns 401 without auth:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST \
     https://<project-ref>.supabase.co/functions/v1/mayar-create-checkout
   ```
   Expected: `401`
2. [ ] Verify `mayar-webhook` returns 401 without token:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST \
     https://<project-ref>.supabase.co/functions/v1/mayar-webhook
   ```
   Expected: `401`
3. [ ] Verify `mayar-webhook` returns 401 with wrong token:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST \
     "https://<project-ref>.supabase.co/functions/v1/mayar-webhook?token=wrong"
   ```
   Expected: `401`
4. [ ] Verify Supabase functions are deployed:
   ```bash
   supabase functions list --project-ref <project-ref>
   ```
5. [ ] Verify required secrets are set:
   ```bash
   supabase secrets list --project-ref <project-ref>
   # Should include: MAYAR_API_KEY, MAYAR_ENV, MAYAR_WEBHOOK_TOKEN, APP_URL
   ```

## How to Verify CI Status

```bash
# Push to main and check GitHub Actions
gh run list --workflow=ci.yml --limit=5

# Or check via GitHub UI:
# https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml
```

All CI jobs must be green:
- Frontend (typecheck, lint, test, build)
- db-types-guard
- supabase (migrations + SQL tests)
- e2e-full-local
- deploy-smoke
- guard-no-test-assert-in-migrations
- guard-package-clean

## How to Verify Migration Status

### Supabase Dashboard

1. Go to Dashboard → Database → Migrations.
2. Confirm all 6 active migrations are applied (baseline + 5 dated).

### Supabase CLI

```bash
supabase link --project-ref <your-project-ref>
supabase migrations list --project-ref <your-project-ref>
```

### SQL Query

```sql
-- List applied migrations
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC;
```

## Rollback Procedure

### Frontend Rollback

1. Hosting platform (Vercel/Cloudflare) → Deployments → find previous working deploy.
2. Click "Promote to Production" on the previous deploy.
3. Verify rollback works.

### Database Rollback

> ⚠️  Database rollback is destructive. Only do this with approval.

1. Take a backup of current state.
2. Identify the migration to revert.
3. Write and test a reverse migration SQL.
4. Apply via Supabase SQL Console.
5. Verify data integrity.

**In practice:** During private beta, prefer fixing forward (new migration) over rolling back.

## Deploy Approval

- **Private beta:** Project owner approves all deploys.
- **CI gate:** All jobs must pass before merge to `main`.
- **Post-deploy:** Operator runs smoke checks and confirms in chat/notification.
