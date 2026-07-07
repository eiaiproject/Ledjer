# Ledjer Testing Guide

## Core Gates

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm --filter web db:migrations:apply:local
```

Local CI wrappers:

```bash
pnpm ci:local:fast
pnpm ci:local:full
```

`ci:local:full` also applies D1 migrations from an empty local database and runs public Playwright smoke tests.

## Playwright Modes

| Mode | Purpose |
|------|---------|
| `local-smoke` | Local public smoke with Vite preview |
| `deploy-smoke` | Public smoke against a deployed URL |

Active Playwright tests are public and do not require seeded backend users:

```bash
pnpm test:e2e:deploy
pnpm test:e2e:cross-browser-smoke
pnpm test:visual
```

The historical authenticated E2E suite and old REST/RPC fixtures are archived under `archive/supabase-reference/e2e/`.

## D1 Migrations

```bash
pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list
```

Fresh-database verification:

```bash
TMP_D1="$(mktemp -d /tmp/ledjer-d1.XXXXXX)"
pnpm --filter web exec wrangler d1 migrations apply DB --local --persist-to "$TMP_D1"
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
