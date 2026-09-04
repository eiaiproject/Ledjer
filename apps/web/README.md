# Ledjer Web App

React + Vite frontend dan Cloudflare Worker API untuk Ledjer - sistem pembukuan double-entry untuk UMKM Indonesia.

## Quick Start

```bash
pnpm install
pnpm --filter web dev
```

Local URL: `http://localhost:5173`.

## Scripts

```bash
pnpm --filter web typecheck   # TypeScript check
pnpm --filter web lint        # ESLint
pnpm --filter web test        # Vitest unit tests
pnpm --filter web build       # Production build (tsc + vite)
pnpm --filter web deploy      # Deploy to Cloudflare Workers
pnpm --filter web db:migrations:apply:local   # Apply D1 migrations locally
pnpm --filter web db:migrations:apply:remote  # Apply D1 migrations to production
pnpm --filter web cf:dev      # Vite dev (HMR + Worker simulator)
```

## Features

- Akuntansi double-entry: posting, void, settle, jurnal manual, saldo awal
- Faktur & piutang: invoice lifecycle, AR/AP aging, party statements
- Inventory: WAC, mutasi stok, HPP otomatis
- Operasional: rekonsiliasi bank, kunci periode, impor/ekspor CSV
- Laporan: neraca saldo, laba rugi, neraca, buku besar, arus kas, aging
- Platform: Google OAuth, kolaborasi tim, notifikasi + Web Push, pencarian global, audit log, lampiran (R2), backup harian, onboarding

## Deploy

Deploy dari root monorepo:

```bash
pnpm deploy
```

Atau step-by-step:

```bash
pnpm --filter web build
pnpm --filter web deploy
```

Script `deploy` menjalankan `wrangler deploy` dari direktori `apps/web` (bukan root workspace), yang diwajibkan oleh Wrangler v4+.

## Structure

```text
src/
  components/
  contexts/
  hooks/
  layouts/
  lib/api/
  pages/
  __tests__/
worker/
  db/migrations/
  middleware/
  routes/
  services/
e2e/
```

## Conventions

- Frontend server state menggunakan TanStack React Query.
- Forms menggunakan React Hook Form + Zod.
- API calls melalui `src/lib/api/*`.
- Worker route handlers tetap tipis; logika akuntansi ada di `worker/services/*`.
- User-facing copy dalam Bahasa Indonesia.
