# Deployment

## Architecture

- **Frontend + API**: Single Cloudflare Worker (`ledjer`).
- **Database**: Cloudflare D1 (`ledjer-production`).
- **Assets**: Static files served by the Worker (SPA routing).
- **Domain**: `ledjer.id`.

## Prerequisites

- Node.js 24+
- pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`)
- Cloudflare account with Workers + D1
- Wrangler configured (`npx wrangler login`)

## Environment Variables (Worker Secrets)

Set via Cloudflare Dashboard or `wrangler secret put`:

| Secret | Description |
|--------|-------------|
| `APP_ORIGIN` | Comma-separated allowed origins |
| `COOKIE_DOMAIN` | Cookie domain (dev only) |
| `EMAIL_API_KEY` | Transactional email API key |
| `EMAIL_FROM` | From email address |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `PASSWORD_PEPPER` | Pepper for password hashing (web users) |
| `ADMIN_PASSWORD_PEPPER` | Pepper for admin password hashing (admin.ledjer.id, separate) |
| `SENTRY_DSN` | Sentry DSN |
| `GIT_SHA` | Current commit SHA (set during CI) |

Not a secret: `APP_ENV` (set as `vars` in `wrangler.jsonc`).

## Deploy Steps

### Production

```bash
# 1. Build
pnpm --filter web build

# 2. Apply migrations (if any)
pnpm --filter web db:migrations:apply:remote

# 3. Deploy Worker
pnpm --filter web deploy
```

### CI/CD (Auto)

The `auto-deploy.yml` workflow runs on push to `main`:
1. Quality gate (typecheck, lint, test, build, secret scan).
2. D1 migrations (remote).
3. Deploy with Wrangler.
4. Post-deploy smoke check (health endpoint).

## Staging Setup

```bash
# 1. Create staging D1 database
npx wrangler d1 create ledjer-staging

# 2. Add preview_database_id to wrangler.jsonc
# (copy the UUID from step 1)

# 3. Create staging environment in wrangler.jsonc:
# [env.staging]
# vars = { APP_ENV = "staging" }
# d1_databases = [{ binding = "DB", database_name = "ledjer-staging", database_id = "<uuid>" }]

# 4. Configure staging secrets
npx wrangler secret put APP_ORIGIN --env staging
npx wrangler secret put GOOGLE_CLIENT_ID --env staging
npx wrangler secret put GOOGLE_CLIENT_SECRET --env staging
npx wrangler secret put PASSWORD_PEPPER --env staging
npx wrangler secret put ADMIN_PASSWORD_PEPPER --env staging
npx wrangler secret put SENTRY_DSN --env staging

# 5. Deploy to staging
npx wrangler deploy --env staging
```

## Rollback

```bash
# Roll back Worker to last stable version
npx wrangler rollback

# D1 migrations are additive-only — no rollback needed.
# For incompatible changes, write a new forward-only migration.
```

## Migration Safety

- All migrations must be additive (no destructive operations without recovery plan).
- Test migrations against a staging database before production.
- Keep `--local` migration testing as part of CI.
