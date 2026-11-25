# Ledjer

Double-entry bookkeeping for Indonesian small businesses.

Ledjer helps UMKM owners record cash and inventory activity without building a spreadsheet. Transactions become balanced journals, and those journals feed the dashboard, profit and loss, balance sheet, and general ledger. The application UI is in Bahasa Indonesia and uses IDR.

[![CI](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml/badge.svg)](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-proprietary-red.svg)](#license)

---

## Contents

- [At a Glance](#at-a-glance)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Commands](#commands)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Current Scope](#current-scope)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## At a Glance

| | |
|---|---|
| **Users** | Owner-operated UMKM (Indonesian small businesses) |
| **Interface** | Bahasa Indonesia, IDR amounts |
| **Accounting model** | Cash-based double-entry with moving-average inventory cost |
| **Access** | Responsive web app and installable PWA |
| **Backend** | Cloudflare Workers, D1, and R2 |
| **License** | Proprietary |

One account owns one book. There is no organization, membership, or role layer in the current product.

---

## Features

### Record transactions

- **Quick entry.** Type a short Indonesian sentence such as `jual kopi 10pcs 50000`, review the parsed result, and confirm it. The parser is deterministic and does not use an AI service.
- **Manual form.** Use it for multi-product sales and purchases, specific cash or bank accounts, and the standard cash-based transaction types.
- **Seven transaction types.** Cash in, cash out, transfer, owner deposit, owner withdrawal, purchase, and stock loss.
- **Balanced journals.** Every posted transaction creates a debit and credit entry that must balance. Users do not create journal lines by hand.
- **Repeat-safe submissions.** Each create request carries an idempotency key. Retrying the same request returns the original transaction instead of creating a duplicate.
- **Void with a trail.** Posted transactions can be marked voided. Reports and balances read posted transactions only, while the original journal remains available for audit.

### Track inventory

- **Product master data.** Each product has a code, name, unit, selling price, current stock, and inventory value.
- **Moving-average cost (WAC).** Purchases update stock and average cost. Sales reduce stock and record cost of goods sold at the current average cost.
- **Stock protection.** A sale that would take stock below zero is rejected.
- **Product history.** Expand a product to view its cost, selling price, margin, and stock movements.
- **Product management.** Create and edit products, set selling prices, filter by low or out-of-stock items, and activate or deactivate products.

### Manage accounts

- **Default chart of accounts.** Registration creates 16 standard accounts, including cash, bank, inventory, equity, income, cost of goods sold, and operating expenses.
- **Cash and bank accounts.** Add accounts, then activate or deactivate them when they are no longer used.
- **Additional income and expense accounts.** Add them from the chart of accounts when the default list is not enough.
- **Account structure.** The chart of accounts groups accounts by assets, liabilities, equity, income, and expenses.

### Review the business

- **Dashboard.** Shows cash and bank balance, recent transactions, and an optional monthly summary for money in, money out, and net income. Negative cash or bank balances are called out.
- **Profit and loss.** Shows income, expenses, and net income for a selected date range.
- **Balance sheet.** Shows assets, liabilities, and equity as of a selected date, with a visible balanced or unbalanced state.
- **General ledger.** Shows journal entries grouped by account with a running balance. Filter by date range and account; results stop at 5,000 rows.
- **CSV export.** Download transactions from the Transactions page. The current filters are applied. Files are UTF-8 with a BOM, and cells are protected against spreadsheet formula injection. Exports are capped at 50,000 rows.

### Work from a phone or offline

- **Responsive layout.** The dashboard, forms, tables, dialogs, and navigation work on phone, tablet, and desktop widths.
- **Installable PWA.** The app includes a web manifest, PNG icons, and a service worker that caches the application shell and legal pages.
- **Offline quick entry.** When the API is unreachable, quick-entry transactions can be queued in the browser's local SQLite database and replayed when the connection returns.
- **Network-backed screens.** Authentication, reports, and other API-backed views still require a connection. Offline mode is limited to the cached shell and the quick-entry outbox.

### Account and access

- **Email and password registration.** New users provide their name, business name, email, and password. Registration creates the book and its default accounts.
- **Optional Google sign-in.** Google OAuth is available when the Worker credentials are configured. The login and registration pages fall back to email and password.
- **Business profile.** Settings lets the owner update the business name and view the account name and email.
- **Legal pages.** Privacy, terms, security, contact, and refund pages are available from the public footer and registration form.
- **Free registration.** The registration screen states that sign-up is free and does not ask for a card. No paid plan or checkout is present in the current UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, React Router 7 |
| Data fetching and forms | TanStack Query 5, React Hook Form, Zod |
| API | Cloudflare Workers with Hono 4 |
| Database | Cloudflare D1 (SQLite) |
| Backups | Cloudflare R2 |
| Local offline store | SQLite WASM |
| Authentication | HttpOnly cookie sessions, optional Google OAuth |
| Monitoring | Sentry, optional |
| Testing | Vitest, React Testing Library, Playwright |
| Package manager | pnpm 10 |
| CI | GitHub Actions |

---

## Architecture

Ledjer ships as one Cloudflare Worker that serves both the API and the built frontend.

```text
Browser
  React + Vite + Tailwind
  Service worker and local SQLite outbox
        |
        | HTTPS, same origin
        v
Cloudflare Worker (Hono)
  /api/*    authentication, transactions, reports, exports, health
  static    built SPA assets
        |
        +--> D1 (book data)
        +--> R2 (scheduled backups)
        +--> Google OAuth (optional)
        +--> Sentry (optional)
```

In development, `@cloudflare/vite-plugin` runs the Worker inside the Vite process, so `/api/*` and the frontend share `http://localhost:5173`.

Key boundaries:

- Every book-scoped table carries a `user_id`, and queries are scoped to the signed-in user.
- Transactions, journal lines, and stock movements are written together so accounting data stays consistent.
- The local SQLite database is only a client-side queue and cache for offline quick entry. D1 remains the source of truth.

---

## Getting Started

### Prerequisites

- Node.js 24 or newer
- pnpm 10.33 or newer
- A Cloudflare account only if you plan to deploy

Enable pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

### Install and run locally

```bash
git clone https://github.com/eiaiproject/Ledjer.git
cd Ledjer

pnpm install

cp apps/web/.env.example apps/web/.env.local
pnpm db:migrations:apply:local
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

`pnpm dev` starts the frontend and the local Worker API together. Local D1 data is stored under `apps/web/.wrangler/`, which is git-ignored.

The default development configuration does not require production secrets. To test Google sign-in locally, add the Google credentials to `apps/web/.dev.vars` as described in [Configuration](#configuration).

---

## Configuration

### Frontend environment

Copy `apps/web/.env.example` to `apps/web/.env.local`.

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | API base URL. Leave empty when the frontend and API share an origin. | Empty |
| `VITE_SENTRY_DSN` | Browser-safe Sentry DSN. Sentry is disabled when empty. | Empty |
| `VITE_APP_VERSION` | Optional version label. | Empty |

All `VITE_*` values are embedded in the browser bundle. Do not put secrets in them.

### Worker secrets

Worker secrets belong in Cloudflare, not in `VITE_*` variables. For local development, put them in `apps/web/.dev.vars`, which is git-ignored.

| Variable | Required | Purpose |
|---|---|---|
| `PASSWORD_PEPPER` | Production | Pepper for password hashing. Production registration fails without it. |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret. |
| `SENTRY_DSN` | No | Worker-side Sentry DSN. |
| `APP_ENV` | Set in Wrangler | Runtime environment. |
| `APP_ORIGIN` | Set in Wrangler | Allowed browser origin or origins for CSRF checks. |

Set production secrets with Wrangler:

```bash
cd apps/web
pnpm exec wrangler secret put PASSWORD_PEPPER
```

Database, R2, and cron settings live in `apps/web/wrangler.jsonc`. The repository root contains a mirror used by CI/CD; keep both configurations in sync when changing bindings.

---

## Commands

Run these from the repository root.

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Vite frontend and local Worker API. |
| `pnpm build` | Type-check, build the frontend and Worker, and apply the production CSP post-build step. |
| `pnpm typecheck` | Run the TypeScript project build check. |
| `pnpm lint` | Run ESLint. |
| `pnpm test` | Run Vitest unit tests. |
| `pnpm test:watch` | Run Vitest in watch mode. |
| `pnpm db:migrations:apply:local` | Apply D1 migrations to the local database. |
| `pnpm db:migrations:list` | List local migration status. |
| `pnpm test:e2e:local` | Run public Playwright smoke and security tests against a local preview. |
| `pnpm test:e2e:local:full` | Run public route and authentication form tests. |
| `pnpm test:e2e:cross-browser-smoke` | Run public smoke tests in Firefox and WebKit after installing those browsers. |
| `pnpm ci:local` | Run dependency checks, scoping checks, typecheck, lint, unit tests, build, and secret scan. |
| `pnpm ci:local:full` | Run the local CI suite plus a fresh D1 migration, seed, and public E2E run. |
| `pnpm deploy` | Deploy the built Worker with Wrangler. Build first. |

Package-level commands are also available under `apps/web/package.json`. Use the package scripts instead of running Wrangler directly from the repository root.

---

## Testing

| Layer | Tool | Location |
|---|---|---|
| Frontend unit tests | Vitest and React Testing Library | `apps/web/src/__tests__` |
| Worker unit tests | Vitest with an in-memory Fake D1 | `apps/web/worker` |
| End-to-end tests | Playwright | `apps/web/e2e` |
| Type checking | TypeScript | Whole web package |
| Linting | ESLint | Whole web package |

The Worker tests run against `FakeD1Database`, so they do not need a Cloudflare account or a live D1 database. Public E2E tests start a local preview server through Playwright. Authenticated accounting specs require a seeded session; see [docs/testing.md](docs/testing.md) for the setup.

CI runs dependency checks, user-scoping checks, typecheck, lint, unit tests, the production build, a build-output secret scan, and D1 migration validation. Deployment and scheduled smoke workflows live in `.github/workflows/`.

---

## Deployment

Ledjer deploys to Cloudflare Workers with D1 and R2 bindings.

```bash
pnpm build
pnpm db:migrations:apply:remote
pnpm deploy
```

The production domain is `https://ledjer.id`. Staging bindings are defined in `apps/web/wrangler.jsonc`.

Operational notes:

- Run Wrangler through the package scripts so it executes from `apps/web`, not from the workspace root.
- Apply forward-only migrations before deploying code that depends on them.
- Keep the root `wrangler.jsonc` mirror in sync with `apps/web/wrangler.jsonc`.
- See [docs/production/deployment.md](docs/production/deployment.md) for environment setup, rollback, and CI/CD details.

---

## Project Structure

```text
apps/web/
  src/                    React application
    components/           Shared UI and feature components
    contexts/             Authentication context
    hooks/                React hooks
    layouts/              Public and dashboard layouts
    lib/                  API client, formatters, local database, sync
    pages/                Route pages
    routes/               Public and protected route guards
    __tests__/            Frontend unit tests
  worker/                 Cloudflare Worker API
    db/migrations/        D1 migrations
    middleware/           Auth, CSRF, errors, logging
    routes/               Hono route handlers
    services/             Accounting, reports, exports, backups
    test/                 Fake D1 and test fixtures
  e2e/                    Playwright tests
  public/                 Manifest, icons, service worker, static files
docs/
  accounting-rules.md     Accounting model and validation rules
  architecture/           Scoping, permissions, and threat model
  api/                    API reference and future proposals
  compliance/             Retention, dependency, and privacy policies
  production/             Deployment, monitoring, backup, and incident runbooks
  security/               CSP and CSRF documentation
  testing.md              Testing guide
scripts/                  CI, deployment, backup, and seeding helpers
load-tests/               k6 load test scenarios
```

---

## Documentation

| Document | Contents |
|---|---|
| [docs/accounting-rules.md](docs/accounting-rules.md) | Transaction types, journal rules, inventory cost, reporting, and exports |
| [docs/architecture/single-user-book.md](docs/architecture/single-user-book.md) | Book scoping and user isolation |
| [docs/architecture/permission-matrix.md](docs/architecture/permission-matrix.md) | Route protection and authorization model |
| [docs/architecture/threat-model.md](docs/architecture/threat-model.md) | Trust boundaries and security threats |
| [docs/api/README.md](docs/api/README.md) | API overview and OpenAPI reference |
| [docs/testing.md](docs/testing.md) | Unit, Worker, and Playwright test setup |
| [docs/production/deployment.md](docs/production/deployment.md) | Production and staging deployment |
| [docs/production/backup-and-restore.md](docs/production/backup-and-restore.md) | D1 backup, restore, and drill procedures |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | Recovery procedures |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [SECURITY.md](SECURITY.md) | Security policy and controls |

---

## Current Scope

Ledjer currently implements a cash-based, single-book accounting workflow. The following are not part of the current UI or API:

- Accounts receivable or payable at the customer or supplier level
- Invoices and invoice settlement
- Manual journal entries
- Opening balances
- Attachments or receipt uploads
- Bank reconciliation
- Team members, roles, or multiple books per account
- Payroll or tax filing

The UI is in Bahasa Indonesia and uses IDR only. The limit for a general ledger response is 5,000 rows, and a CSV export is limited to 50,000 transactions. Offline quick entry is queued locally, but the rest of the application still depends on the API.

---

## Security

Security controls include HTTPS in production, HttpOnly and Secure session cookies, hashed session tokens, password hashing with a production pepper, CSRF origin validation, rate limits on authentication and transaction endpoints, and per-user database scoping. Error responses are redacted so stack traces and SQL details are not returned to the browser.

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md) and use the private reporting channel described there.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Install dependencies with `pnpm install`.
3. Make the change and add or update tests where behavior changes.
4. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
5. Run the relevant Playwright suite if the change affects public routes or authentication.
6. Open a pull request with a short description of the problem and the solution.

Use Conventional Commits for commit messages. Keep user-facing copy in Bahasa Indonesia.

---

## License

Proprietary. All rights reserved.

The source may not be distributed, modified, or used without written permission from the owner. See [package.json](package.json) for the package license metadata.
