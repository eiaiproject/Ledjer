# Ledjer Web App

React + Vite frontend dan Cloudflare Worker API untuk Ledjer - pembukuan
double-entry kas untuk UMKM Indonesia (MVP cash-only).

## Quick Start

```bash
pnpm install
pnpm --filter web dev
```

Local URL: `http://localhost:5173` (Vite me-proxy `/api/*` ke Worker).

## Scripts

```bash
pnpm --filter web typecheck   # TypeScript check
pnpm --filter web lint        # ESLint
pnpm --filter web test        # Vitest unit tests
pnpm --filter web build       # Production build (tsc + vite + postbuild CSP)
pnpm --filter web deploy      # Deploy to Cloudflare Workers
pnpm --filter web db:migrations:apply:local   # Apply D1 migrations locally
pnpm --filter web db:migrations:apply:remote  # Apply D1 migrations to production
pnpm --filter web cf:dev      # Vite dev (HMR + Worker simulator)
```

## Features (MVP)

- Pencatatan transaksi: 5 jenis - uang masuk, uang keluar, transfer,
  modal masuk (owner deposit), pengambilan pemilik (owner withdrawal)
- Double-entry: setiap transaksi menjadi jurnal debit-kredit seimbang
- Void transaksi dengan jejak audit (status `voided`; laporan hanya membaca
  transaksi `posted`)
- Idempotency key per form - kirim ulang tidak menduplikasi transaksi
- Chart of accounts default 14 akun (dibuat saat registrasi); kelola akun
  kas/bank tambahan (buat, rename, aktif/nonaktif)
- Laporan: laba rugi, neraca (selalu balance), dan buku besar per akun
  dengan saldo berjalan
- Dashboard: saldo kas/bank, uang masuk/keluar bulan ini, laba bersih,
  transaksi terbaru, peringatan saldo negatif
- Ekspor CSV transaksi (anti formula-injection, UTF-8 BOM, batas 50rb baris)
- Autentikasi: password (PBKDF2 + pepper) dan Google OAuth; sesi cookie
  httpOnly dengan rotasi token
- Backup harian D1 → R2 (cron) + restore drill; audit log

> Ruang lingkup di luar MVP (inventory, faktur/piutang-utang, jurnal manual,
> saldo awal, kolaborasi tim, onboarding wizard, dll.) sengaja tidak ada.
> Lihat root `README.md`, `docs/accounting-rules.md`, dan riwayat git.

## Deploy

Deploy dari root monorepo:

```bash
pnpm deploy
```

Script `deploy` menjalankan `wrangler deploy` dari direktori `apps/web` (bukan
root workspace), yang diwajibkan oleh Wrangler v4+.

## Structure

```text
src/
  components/            Shared UI components (components/ui = design system)
  contexts/              Auth context
  hooks/                 Custom hooks (organization, dll.)
  layouts/               Dashboard & public layouts
  lib/                   API client, query keys, utils, formatters
  pages/                 Route pages (transactions, accounts, reports, settings)
  routes/                Protected/Public route guards
  __tests__/             Frontend unit tests
worker/
  index.ts               Worker entrypoint + Hono app (middleware stack)
  env.ts                 Env/binding types
  db/                    D1 helpers, schema constants, migrations
  middleware/            Auth, org-scoping, CSRF, error handling, logging, metrics
  routes/                Hono route handlers (thin controllers)
  services/              Domain logic (accounting, auth, reports, backup, ...)
  auth/                  Password hashing, token/session helpers
  http/                  Error types, JSON/Zod parsing, audit helper
  test/                  FakeD1Database + deterministic seed fixtures
e2e/                     Playwright specs (public + auth fixture)
```

## Conventions

- Frontend server state menggunakan TanStack React Query (query keys terpusat
  di `src/lib/query-keys.ts`).
- Forms menggunakan React Hook Form + Zod (zod v4).
- API calls melalui `src/lib/api/*` (client tunggal dengan penanganan 401).
- Worker route handlers tetap tipis; logika domain ada di `worker/services/*`.
- User-facing copy dalam Bahasa Indonesia.
- Worker diuji lewat `FakeD1Database` (tiruan in-memory) + seed fixtures;
  e2e Playwright mencakup halaman publik & alur CRUD terautentikasi via
  fixture `e2e/helpers/auth.ts` (session token di CI, login API saat lokal).
