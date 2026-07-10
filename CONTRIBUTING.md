# Contributing

## Prerequisites

- Node.js 24+
- pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`)
- Wrangler CLI (included via devDependencies)
- Access to Cloudflare account with Workers + D1

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

## Development

```bash
pnpm dev    # starts Vite dev server (HMR + Worker simulator)
```

## CI Pipeline (local)

```bash
pnpm ci:local:fast   # typecheck + lint + test + build + secrets scan
pnpm ci:local:full   # same + D1 migration apply + E2E tests
```

## Deploy

```bash
pnpm deploy   # build + deploy to Cloudflare Workers
```

See [README.md](./README.md#deployment) for details.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.)
- **Branch**: feature branches from `main`
- **PR**: PR to `main` triggers CI. Merge only after CI is green.
- **Migrations**: D1 migration files follow `NNNN_descriptive_name.sql` format.

## Project Structure

- `apps/web/src/` — React SPA
- `apps/web/worker/` — Hono Worker API
- `apps/web/e2e/` — Playwright tests
- `scripts/` — CI/deploy tooling
- `docs/` — Project documentation
