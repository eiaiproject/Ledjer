# Ledjer — Frontend (`apps/web`)

React 19 + TypeScript + Vite + Tailwind CSS application for the Ledjer bookkeeping system.

## Quick Start

```bash
# From repo root
pnpm install
pnpm dev
# → http://localhost:5173
```

Requires a running Supabase backend. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

## Scripts

```bash
pnpm --filter web typecheck   # TypeScript compilation
pnpm --filter web lint        # ESLint
pnpm --filter web test        # Vitest unit + integration tests
pnpm --filter web build       # Production build → dist/
```

## Structure

```
src/
├── components/ui/      # Reusable UI primitives (Button, Card, Input, Modal, etc.)
├── components/         # Feature components (error-boundary, auth-brand-panel)
├── contexts/           # AuthContext + AuthProvider
├── hooks/              # Custom hooks (useOrganization, useOrgPermissions)
├── layouts/            # DashboardLayout (sidebar navigation)
├── lib/                # Utilities (supabase client, errors, rate-limit, utils)
├── pages/              # Route-level pages (dashboard, transactions, accounts, products, reports, settings)
└── __tests__/          # Vitest unit + integration tests
```

## Key Conventions

- **Styling:** Tailwind CSS with custom theme tokens (wood, leaf, clay, cream palettes).
- **State:** TanStack React Query for server state; local state via `useState`/`useForm`.
- **Forms:** React Hook Form + Zod v4 validation.
- **Auth:** Supabase Auth via `AuthContext`. Protected routes check session.
- **Indonesian UX copy** — all user-facing text is in Bahasa Indonesia.
