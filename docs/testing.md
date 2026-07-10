# Ledjer Testing Guide

## Core Gates

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm --filter web db:migrations:apply:local
```

Local CI wrapper:

```bash
pnpm ci:local
pnpm ci:local:full
```

`ci:local:full` also applies D1 migrations from an empty local database and runs the full public Playwright E2E suite.

## Playwright Modes

| Mode | Purpose |
|------|---------|
| `local-smoke` | Local public smoke with Vite preview |
| `local-full` | Local public E2E suite with auth-form, route, security, accessibility, responsive, and performance checks |
| `deploy-smoke` | Public smoke against a deployed URL |

Active Playwright tests are public and do not require seeded backend users:

```bash
pnpm test:e2e:local:full
pnpm test:e2e:deploy
pnpm test:e2e:cross-browser-smoke
pnpm test:visual
```

`test:e2e:local:full` and `ci:local:full` run every non-visual public spec: smoke, auth-form validation, static routes, public security checks, accessibility, responsive layout, and performance smoke. Visual regression stays in `pnpm test:visual` because its screenshots use platform-specific committed baselines.

Authenticated accounting behavior is covered by Worker service tests. Playwright stays public-only.

## D1 Migrations

```bash
pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list
```

Fresh-database verification:

```bash
TMP_D1="$(mktemp -d /tmp/ledjer-d1.XXXXXX)"
cd apps/web && pnpm exec wrangler d1 migrations apply DB --local --persist-to "$TMP_D1"
rm -rf "$TMP_D1"
```

## CI

`.github/workflows/ci.yml` runs:

- Typecheck, lint, Vitest, build
- Build secret scan
- D1 migration naming guard
- Fresh D1 migration apply
- Package clean guard
- Public Playwright smoke
- Public visual regression
