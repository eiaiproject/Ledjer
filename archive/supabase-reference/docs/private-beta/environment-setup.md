# Environment Setup — Private Beta

## Required Variables

| Variable | Where | Required | Notes |
|----------|-------|----------|-------|
| `VITE_SUPABASE_URL` | Frontend hosting | Yes | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Frontend hosting | Yes | Public anon key from Supabase dashboard |
| `VITE_SENTRY_DSN` | Frontend hosting | Optional | Enables browser error tracking |
| `SUPABASE_SERVICE_ROLE_KEY` | CI / admin scripts only | Conditional | Never in frontend hosting |
| `SENTRY_ORG` | CI only | Optional | For source map upload |
| `SENTRY_PROJECT` | CI only | Optional | For source map upload |
| `SENTRY_AUTH_TOKEN` | CI only | Optional | For source map upload |

## Local Development

```bash
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with local Supabase values:
#   VITE_SUPABASE_URL=http://localhost:54321
#   VITE_SUPABASE_ANON_KEY=<from supabase start output>
```

Start Supabase local stack:

```bash
supabase start --workdir .
# Output includes ANON_KEY — paste into .env.local
```

## Staging (Separate Supabase Project)

1. Create a second Supabase project for staging.
2. Copy `apps/web/.env.example` → `apps/web/.env.staging`.
3. Point `VITE_SUPABASE_URL` to the staging project.
4. Apply all migrations to staging: `supabase db push`.
5. Set env vars in hosting platform (Vercel/Cloudflare) for the staging branch.

## Private Beta / Production

### Hosting Platform (Vercel / Cloudflare Pages / Netlify)

Set these in the hosting dashboard under **Environment Variables** (production scope):

```
VITE_SUPABASE_URL=https://<your-prod-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-prod-anon-key>
VITE_SENTRY_DSN=https://<key>@sentry.io/<project-id>   # optional
```

### Supabase Dashboard

From Supabase dashboard → Settings → API:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** → `VITE_SUPABASE_ANON_KEY`

### GitHub Actions Secrets (for CI deploy smoke tests)

```
SUPABASE_SERVICE_ROLE_KEY=<only if CI needs admin access>
```

## Rules

- **Frontend `VITE_*` variables** are safe for browser exposure. They are embedded in the JS bundle.
- **`SUPABASE_SERVICE_ROLE_KEY`** must never appear in frontend code, `.env.local`, or hosting env vars. It bypasses RLS.
- **`.env.example`** must never contain real secrets. Use placeholder values.
- **Rotate keys** if the anon key was ever committed to version control history.
