# Ledjer

Sistem pembukuan double-entry untuk UMKM Indonesia. Ledjer berjalan sebagai aplikasi React + Cloudflare Worker dengan database Cloudflare D1.

[![CI](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml/badge.svg)](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml)

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| API | Cloudflare Workers via Hono |
| Database | Cloudflare D1 |
| Auth | Worker-native cookie session + CSRF protection |
| Testing | Vitest, Testing Library, Playwright |
| Package manager | pnpm 10 workspaces |

## Quick Start

```bash
pnpm install
pnpm dev
```

Dev server: `http://localhost:5173`.

Optional frontend env:

```bash
cp apps/web/.env.example apps/web/.env.local
```

`VITE_API_BASE_URL` can stay empty when the Worker API is same-origin.

## Common Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build

pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list

pnpm ci:local:fast
pnpm ci:local:full
pnpm deploy
```

## Project Structure

```text
apps/web/
  src/                     React application
  worker/                  Cloudflare Worker API
    db/migrations/         D1 migrations
    routes/                Hono routes
    services/              Domain logic
  e2e/                     Public Playwright smoke/visual tests
docs/
  accounting-rules.md       Accounting rules reference
  testing.md                Testing guide
  production/               Monitoring and incident response
scripts/
  ci-local.sh               Run CI checks locally
```

## Deployment

```bash
# Build + deploy (Wrangler)
pnpm --filter web build
pnpm --filter web deploy
```

D1 migrations (production):
```bash
pnpm --filter web db:migrations:apply:remote
```

### Troubleshooting Deploy

**Error: "The Cloudflare application detection logic has been run in the root of a workspace"**

Penyebab: Wrangler v4+ mendeteksi bahwa `wrangler deploy` dijalankan dari root workspace (`pnpm --filter web exec wrangler deploy`).

Solusi: Gunakan script yang sudah didefinisikan di `apps/web/package.json` via `pnpm --filter web <script>` — script tersebut dijalankan dari direktori package (`apps/web`), bukan dari root.

✅ `pnpm --filter web deploy` → otomatis `cd apps/web && wrangler deploy`
❌ `pnpm --filter web exec wrangler deploy` → dijalankan dari root, gagal

Pastikan juga:
- Wrangler config ada di `apps/web/wrangler.jsonc` (sudah)
- Command dijalankan dari direktori yang benar di CI/CD workflows

### Production Secrets

Worker vars/secrets dikonfigurasi di Cloudflare Dashboard atau via `wrangler secret put`. Jangan pernah menaruh Worker secrets di `VITE_*` variables — `VITE_*` di-embed ke browser bundle.

## Current Scope

- Organization onboarding and memberships
- Custom auth, password reset, email verification token model
- Chart of accounts
- Products and inventory movements
- Transaction posting and voiding
- Trial balance, profit/loss, balance sheet, general ledger
- Team invitations
- CSV exports
- Dashboard summary through Worker API

## Testing

See [docs/testing.md](docs/testing.md). The active CI path is Cloudflare-native: typecheck, lint, unit tests, production build, D1 migration apply from an empty local database, and public Playwright smoke.
