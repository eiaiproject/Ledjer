# Production Rehearsal Checklist

Step-by-step guide to deploy Ledjer from a clean state into a production-like environment.

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 10
- Supabase CLI installed (`supabase --version`)
- Access to Supabase project (or create new one)
- Access to hosting platform (Vercel / Cloudflare Pages / Netlify)

## Step 1: Fresh Supabase Project Setup

1. Create new project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Note the **Project URL** and **anon public key** from Settings → API
3. Note the **database password** (shown during creation)

## Step 2: Apply Migrations from Zero

```bash
# Login and link
supabase login
supabase link --project-ref <your-project-id>

# Apply all migrations
supabase db push

# Verify migration count (should be 6: baseline + 5 dated)
supabase migrations list --project-ref <your-project-id>
```

## Step 3: Generate and Check Database Types

```bash
# Generate types from remote
supabase gen types typescript --project-ref <your-project-id> --schema public > packages/database-types/index.ts

# Verify drift check passes
bash scripts/check-db-types.sh --live  # if local Supabase available
pnpm db-types:check                    # always works (size + shim check)
```

## Step 4: Configure Auth Redirect URLs

In Supabase dashboard → Authentication → URL Configuration:

| Setting | Value |
|---------|-------|
| Site URL | `https://app.ledjer.id` |
| Redirect URLs | `https://app.ledjer.id`, `https://app.ledjer.id/auth/callback` |

For local dev, also add:
- `http://localhost:5173`
- `http://localhost:5173/auth/callback`

## Step 5: Configure Email Provider

In Supabase dashboard → Authentication → Email Templates:

1. Set SMTP provider (Resend / SendGrid / Postmark recommended)
2. Verify email delivery works (signup confirmation, password recovery)
3. Update email templates if needed (default Supabase templates work)

**If no SMTP configured:** Email features (signup confirmation, password recovery, invitations) will not work. Local dev uses Inbucket (built-in test SMTP).

## Step 6: Build Frontend with Production Env

```bash
# Set environment variables
export VITE_SUPABASE_URL=https://<project-ref>.supabase.co
export VITE_SUPABASE_ANON_KEY=<anon-key>
export VITE_SENTRY_DSN=<optional-sentry-dsn>

# Build
pnpm --filter web build
# Output: apps/web/dist/
```

## Step 7: Deploy to Hosting Platform

### Vercel
```bash
vercel --prod
# Set env vars in Vercel dashboard:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_SENTRY_DSN (optional)
```

### Cloudflare Pages
```bash
# Connect repo to Cloudflare Pages
# Set build command: pnpm --filter web build
# Set output directory: apps/web/dist
# Set env vars in Cloudflare dashboard
```

### Self-hosted (nginx)
```bash
# Copy dist to web root
cp -r apps/web/dist/* /var/www/ledjer/

# Configure nginx for SPA fallback
location / {
    try_files $uri $uri/ /index.html;
}
```

## Step 8: Run Smoke Tests After Deploy

```bash
# Run deploy smoke tests
E2E_MODE=deploy-smoke E2E_BASE_URL=https://app.ledjer.id/ pnpm test:e2e:deploy
```

### Manual Smoke Checks

1. [ ] Landing page loads (`/`)
2. [ ] Login page loads (`/login`)
3. [ ] Register page loads (`/register`)
4. [ ] Forgot password page loads (`/forgot-password`)
5. [ ] Protected routes redirect to login when unauthenticated
6. [ ] Auth callback works (`/auth/callback`)
7. [ ] Unknown route shows 404 page
8. [ ] No console errors in browser
9. [ ] Security headers present (CSP, HSTS, X-Frame-Options)
10. [ ] Sentry receives errors (if DSN configured)

## Step 9: Verify Security Headers

```bash
curl -I https://app.ledjer.id/login | grep -iE '(strict-transport|x-frame|x-content-type|content-security)'
```

Expected headers:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'self'; ...`

## Step 10: Verify Backup Restore

1. Supabase dashboard → Database → Backups → Create backup
2. Restore to temporary project (or use branch)
3. Verify data integrity (see `docs/production/backup-restore.md`)

## Environment Variables Reference

| Variable | Required | Where | Notes |
|----------|----------|-------|-------|
| `VITE_SUPABASE_URL` | Yes | Frontend hosting | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Frontend hosting | Public anon key |
| `VITE_SENTRY_DSN` | No | Frontend hosting | Enables error tracking |
| `VITE_APP_URL` | No | Frontend hosting | Override for auth redirects |

**Never** set `SUPABASE_SERVICE_ROLE_KEY` in frontend hosting.

## Troubleshooting

### "Konfigurasi Supabase belum lengkap"
→ `.env.local` missing or placeholder values. Copy `.env.example` → `.env.local` and fill in real values.

### Auth redirects fail
→ Check redirect URLs in Supabase dashboard match your domain exactly.

### Emails not sending
→ Configure SMTP in Supabase dashboard → Authentication → Email.

### Build fails
→ Run `pnpm test:quality` locally to catch issues before deploy.
