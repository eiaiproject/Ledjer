# Ledjer

> Sistem pembukuan *double-entry* untuk UMKM Indonesia. Modern, cloud-native, dan gratis.

Ledjer membantu UMKM mencatat transaksi, mengelola inventory, dan menghasilkan laporan keuangan tanpa perlu pengetahuan akuntansi formal. Berjalan di Cloudflare edge network — cepat, aman, dan tanpa manajemen server.

[![CI](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml/badge.svg)](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-proprietary-red.svg)](#license)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Common Commands](#common-commands)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Features

- **Double-entry bookkeeping** — posting, void, settle (AR/AP) with complete audit trail
- **Chart of accounts** — asset, liability, equity, revenue, expense, COGS; fully configurable
- **Inventory management** — weighted average cost (WAC), stock movements, auto-COGS
- **Financial reports** — trial balance, profit & loss, balance sheet, general ledger
- **Indonesian-first** — UI in Bahasa Indonesia, IDR currency, tax concepts familiar to UMKM
- **UMKM-ready** — supports `simple_trading` and `service` business types; zero accounting knowledge required
- **OAuth Google** — sign in with Google, auto-link existing accounts
- **Team collaboration** — roles (owner/admin/member/viewer), invitations, granular permissions
- **CSV exports** — transactions, accounts, products, all financial reports
- **Cloudflare-native** — Workers + D1, zero server management, global edge deployment

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, TypeScript |
| **API** | Cloudflare Workers via Hono |
| **Database** | Cloudflare D1 (SQLite-based) |
| **Auth** | Worker-native cookie session + CSRF protection |
| **Monitoring** | Sentry (frontend + worker) |
| **Testing** | Vitest, React Testing Library, Playwright |
| **Package Manager** | pnpm 10 workspaces |
| **CI/CD** | GitHub Actions |

---

## Quick Start

### Prerequisites

- **Node.js** 24+
- **pnpm** 10 — enable via Corepack:
  ```bash
  corepack enable && corepack prepare pnpm@10 --activate
  ```
- **Cloudflare account** — with Workers + D1 enabled (for deployment)

### Install & Run

```bash
# Clone & install dependencies
git clone https://github.com/eiaiproject/Ledjer.git
cd Ledjer
pnpm install

# Start development server
pnpm dev
```

Frontend: [http://localhost:5173](http://localhost:5173)  
Worker API: [http://localhost:8788](http://localhost:8788) (runs alongside via Vite proxy)

### Environment Setup

```bash
cp apps/web/.env.example apps/web/.env.local
```

`VITE_API_BASE_URL` can stay empty when the Worker API is same-origin (Vite proxies `/api/*` to the Worker by default).

---

## Common Commands

```bash
pnpm typecheck              # TypeScript type checking
pnpm lint                   # ESLint
pnpm test                   # Unit tests
pnpm build                  # Production build (frontend + worker)
pnpm dev                    # Start development servers

# Database
pnpm --filter web db:migrations:apply:local    # Apply D1 migrations locally
pnpm --filter web db:migrations:list           # List pending migrations

# CI
pnpm ci:local:fast          # Quick CI checks (typecheck + lint + test)
pnpm ci:local:full          # Full CI checks (includes build + migration apply)

# Deploy
pnpm deploy                 # Build + deploy to Cloudflare
```

---

## Project Structure

```
apps/web/
  src/                      React application (Vite)
    components/             Shared UI components
    layouts/                Page layouts (dashboard, auth)
    pages/                  Route pages
    hooks/                  Custom React hooks
  worker/                   Cloudflare Worker API
    db/migrations/          D1 migration files
    routes/                 Hono route handlers
    services/               Domain logic & business rules
    middleware/              Auth, CSRF, validation
  e2e/                      Playwright end-to-end tests
docs/
  accounting-rules.md        Accounting rules & conventions
  testing.md                 Testing guide & conventions
  production/                Runbooks for monitoring & incident response
scripts/
  ci-local.sh                Local CI runner (simulates GitHub Actions)
```

---

## Configuration

### Frontend (`apps/web/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | API base URL (empty if same-origin) | `""` |
| `VITE_SENTRY_DSN` | Sentry DSN for error reporting | `""` (disabled) |
| `VITE_APP_VERSION` | Version shown in footer | `""` |

### Worker (Cloudflare Dashboard / `wrangler secret`)

Worker secrets **must not** be placed in `VITE_*` variables (they are embedded in the browser bundle). Configure them via Cloudflare Dashboard or CLI:

```bash
cd apps/web
npx wrangler secret put SENTRY_DSN
```

| Secret | Description |
|--------|-------------|
| `SENTRY_DSN` | Sentry DSN for worker error reporting |

Additional configuration is managed via `wrangler.jsonc` (vars, D1 bindings, R2 buckets, cron triggers).

---

## Deployment

### Production

```bash
pnpm --filter web build
pnpm --filter web deploy
```

### D1 Migrations (Production)

```bash
pnpm --filter web db:migrations:apply:remote
```

### Troubleshooting

**Error: "The Cloudflare application detection logic has been run in the root of a workspace"**

Wrangler v4+ detects workspace root and refuses to run. Always use the package-level script (not `wrangler deploy` directly):

| ✅ Correct | ❌ Incorrect |
|------------|-------------|
| `pnpm --filter web deploy` | `pnpm --filter web exec wrangler deploy` |

The `deploy` script in `apps/web/package.json` changes directory to `apps/web` before running Wrangler.

---

## Testing

See full guide at [docs/testing.md](docs/testing.md).

| Type | Tool | Command |
|------|------|---------|
| **Unit** | Vitest + Testing Library | `pnpm test` |
| **E2E** | Playwright | `cd apps/web && npx playwright test` |
| **Type** | TypeScript | `pnpm typecheck` |
| **Lint** | ESLint | `pnpm lint` |

CI pipeline: typecheck → lint → unit tests → production build → D1 migration apply (empty local DB) → Playwright smoke tests.

---

## Contributing

> **Note:** Contribution guidelines are still being drafted.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

Please ensure all CI checks pass before requesting review.

---

## Security

If you discover a security vulnerability, **do not** open a public issue.  

Options:
- Open a **GitHub Security Advisory** — [github.com/eiaiproject/Ledjer/security/advisories](https://github.com/eiaiproject/Ledjer/security/advisories)
- Email the maintainer directly (see commit history)

See [SECURITY.md](SECURITY.md) for the full policy.

---

## License

Proprietary. All rights reserved.

Tidak boleh didistribusikan, dimodifikasi, atau digunakan tanpa izin tertulis dari pemilik.

---

*Built with React, Cloudflare Workers, and D1.*
