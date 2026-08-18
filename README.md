# Ledjer

> Sistem pembukuan *double-entry* untuk UMKM Indonesia. Modern, cloud-native, dan gratis.

Ledjer membantu UMKM mencatat transaksi, mengelola inventory, dan menghasilkan laporan keuangan tanpa perlu pengetahuan akuntansi formal. Berjalan di Cloudflare edge network — cepat, aman, dan tanpa manajemen server.

Dokumentasi lengkap: [docs.ledjer.id](https://docs.ledjer.id)

[![CI](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml/badge.svg)](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-docs.ledjer.id-8B5A3C)](https://docs.ledjer.id)
[![License](https://img.shields.io/badge/license-proprietary-red.svg)](#license)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Common Commands](#common-commands)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Features

### Akuntansi
- **Double-entry bookkeeping** — posting, void, settle (AR/AP) dengan audit trail lengkap
- **Chart of accounts** — aset, kewajiban, ekuitas, pendapatan, beban, HPP; sepenuhnya dapat dikonfigurasi
- **Jurnal manual** — pencatatan jurnal umum dengan validasi keseimbangan debit-kredit
- **Saldo awal** — wizard saldo awal per akun, termasuk impor dari file

### Penjualan & Piutang
- **Faktur (invoices)** — siklus hidup faktur lengkap: draft → diterbitkan → dibayar → void
- **Piutang & utang (receivables/payables)** — pelacakan AR/AP dengan umur piutang (aging)
- **Pihak/relasi (parties)** — kelola pelanggan & pemasok
- **Laporan per pihak (party statement)** — riwayat transaksi per pelanggan/pemasok

### Inventory
- **Manajemen stok** — weighted average cost (WAC), mutasi stok, HPP otomatis
- **Produk** — katalog produk dengan harga pokok & harga jual

### Operasional
- **Rekonsiliasi bank** — cocokkan transaksi internal dengan mutasi bank
- **Kunci periode (period locks)** — kunci periode akuntansi setelah tutup buku
- **Impor data (CSV)** — chart of accounts, produk, pihak, saldo awal
- **Ekspor (CSV & PDF)** — transaksi, akun, produk, dan semua laporan keuangan; PDF server-generated agar konsisten di semua perangkat

### Laporan Keuangan
- **Neraca saldo (trial balance)**
- **Laba rugi (profit & loss)**
- **Neraca (balance sheet)**
- **Buku besar (general ledger)**
- **Arus kas (cash flow)**
- **Umur piutang (AR aging)**

### Platform
- **OAuth Google** — masuk dengan Google, auto-link akun yang sudah ada
- **Kolaborasi tim** — peran (owner/admin/member/viewer), undangan, izin granular
- **Notifikasi & Web Push** — notifikasi in-app dan push browser
- **Pencarian global** — cari transaksi, akun, produk, dan pihak dari satu tempat
- **Audit log** — jejak lengkap aksi pengguna untuk kepatuhan
- **Lampiran (R2)** — simpan dokumen pendukung transaksi
- **Backup harian otomatis** — snapshot D1 terjadwal ke R2 (cron 03:00 UTC)
- **Onboarding** — wizard set-up awal (jenis bisnis, saldo awal, undangan tim)
- **Rate limiting** — proteksi endpoint autentikasi

### Admin Platform (Internal)
- **Dashboard admin** — panel operasional internal di [admin.ledjer.id](https://admin.ledjer.id) dengan kredensial terpisah
- **Kelola pengguna** — lihat semua akun, aktif/nonaktifkan, kirim reset password, hapus akun
- **Kelola organisasi** — detail anggota & statistik, aktif/nonaktifkan organisasi (akses anggota diblokir saat nonaktif)
- **Audit log global** — seluruh aktivitas lintas tenant termasuk aksi admin
- **Monitoring** — jumlah pengguna/org/transaksi, registrasi per hari, health check aplikasi utama
- **Kelola backup** — riwayat snapshot R2, verifikasi manifest, restore drill, backup manual

### Lokalisasi
- **Indonesian-first** — UI dalam Bahasa Indonesia, mata uang IDR, konsep pajak yang familier bagi UMKM
- **UMKM-ready** — mendukung jenis bisnis `simple_trading` (jual beli barang) dan `service` (jasa); tanpa perlu pengetahuan akuntansi

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, TypeScript 6 |
| **State & Forms** | TanStack React Query, React Hook Form, Zod |
| **API** | Cloudflare Workers via Hono |
| **Database** | Cloudflare D1 (SQLite-based) |
| **Storage** | Cloudflare R2 (lampiran, backup) |
| **Auth** | Worker-native cookie session + CSRF protection, Google OAuth |
| **Realtime** | Web Push (subscriptions) |
| **Monitoring** | Sentry (frontend + worker) |
| **Docs** | VitePress (apps/docs) |
| **Testing** | Vitest, React Testing Library, Playwright |
| **Package Manager** | pnpm 10 workspaces |
| **CI/CD** | GitHub Actions (CI, auto-deploy, E2E, dependency scan) |

---

## Quick Start

### Prerequisites

- **Node.js** 24+
- **pnpm** 10 — enable via Corepack:
  ```bash
  corepack enable && corepack prepare pnpm@10 --activate
  ```
- **Cloudflare account** — dengan Workers + D1 aktif (untuk deployment)

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
Worker API: [http://localhost:8788](http://localhost:8788) (berjalan bersamaan via Vite proxy)

### Environment Setup

```bash
cp apps/web/.env.example apps/web/.env.local
```

`VITE_API_BASE_URL` boleh dibiarkan kosong jika Worker API same-origin (Vite me-proxy `/api/*` ke Worker secara default).

---

## Common Commands

```bash
pnpm typecheck              # TypeScript type checking
pnpm lint                   # ESLint
pnpm test                   # Unit tests
pnpm build                  # Production build (frontend + worker)
pnpm dev                    # Start development servers

# Database
pnpm db:migrations:apply:local    # Apply D1 migrations locally
pnpm db:migrations:list           # List pending migrations

# CI
pnpm ci:local:fast          # Quick CI checks (typecheck + lint + test)
pnpm ci:local:full          # Full CI checks (includes build + migration apply)

# Docs (VitePress)
pnpm docs:dev               # Start docs dev server
pnpm docs:build             # Build docs
pnpm docs:deploy            # Deploy docs to Cloudflare

# Deploy
pnpm deploy                 # Build + deploy web to Cloudflare
pnpm admin:build            # Build admin dashboard (admin.ledjer.id)
pnpm admin:deploy           # Deploy admin dashboard to Cloudflare
```

### Provision admin akun

```bash
node scripts/create-admin.mjs <email> "<Nama Lengkap>" '<password>'   # production
node scripts/create-admin.mjs <email> "<Nama Lengkap>" '<password>' --staging
```

---

## Project Structure

```
apps/
  web/
    src/                      React application (Vite)
      components/             Shared UI components
      layouts/                Page layouts (dashboard, auth)
      pages/                  Route pages
      hooks/                  Custom React hooks
      lib/                    API client, utilities
    worker/                   Cloudflare Worker API
      db/migrations/          D1 migration files
      routes/                 Hono route handlers
      services/               Domain logic & business rules
      middleware/             Auth, CSRF, org-scoping, error handling
    e2e/                      Playwright end-to-end tests
  admin/                      Admin dashboard (admin.ledjer.id) — internal ops
    src/                      React application (Vite)
    worker/                   Admin Worker API (same D1, platform-wide)
  docs/                       VitePress documentation site (docs.ledjer.id)
    docs/                     Markdown content & theme
    worker/                   Docs worker (Cloudflare)
docs/
  api/                        API design docs (invoices, receivables, dll.)
  architecture/               Architecture decisions & diagrams
  production/                 Runbooks (monitoring, incident response)
  compliance/                 Security & dependency policies
  accounting-rules.md         Accounting rules & conventions
  testing.md                  Testing guide & conventions
scripts/
  ci-local.sh                 Local CI runner (simulates GitHub Actions)
```

---

## Documentation

- **[docs.ledjer.id](https://docs.ledjer.id)** — dokumentasi pengguna (panduan memulai, fitur, FAQ)
- [docs/api](docs/api) — desain API (OpenAPI, versi, import, invoices, reconciliation, dll.)
- [docs/architecture](docs/architecture) — keputusan & diagram arsitektur
- [docs/production](docs/production) — runbook operasional (monitoring, incident response)
- [docs/accounting-rules.md](docs/accounting-rules.md) — aturan & konvensi akuntansi
- [docs/testing.md](docs/testing.md) — panduan & konvensi pengujian
- [CHANGELOG.md](CHANGELOG.md) — riwayat perubahan
- [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) — prosedur pemulihan bencana
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — lisensi dependensi pihak ketiga

---

## Configuration

### Frontend (`apps/web/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | API base URL (kosong jika same-origin) | `""` |
| `VITE_SENTRY_DSN` | Sentry DSN untuk error reporting | `""` (disabled) |
| `VITE_APP_VERSION` | Versi yang ditampilkan di footer | `""` |

### Worker (Cloudflare Dashboard / `wrangler secret`)

Worker secrets **tidak boleh** ditaruh di variabel `VITE_*` (ter-embed di bundle browser). Konfigurasikan via Cloudflare Dashboard atau CLI:

```bash
cd apps/web
npx wrangler secret put SENTRY_DSN
```

| Secret | Description |
|--------|-------------|
| `SENTRY_DSN` | Sentry DSN untuk worker error reporting |

Konfigurasi tambahan dikelola via `wrangler.jsonc` (vars, D1 bindings, R2 buckets, cron triggers).

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

### Docs Site

```bash
pnpm docs:build
pnpm docs:deploy
```

### Troubleshooting

**Error: "The Cloudflare application detection logic has been run in the root of a workspace"**

Wrangler v4+ mendeteksi root workspace dan menolak berjalan. Selalu gunakan script level-package (bukan `wrangler deploy` langsung):

| ✅ Correct | ❌ Incorrect |
|------------|-------------|
| `pnpm --filter web deploy` | `pnpm --filter web exec wrangler deploy` |

Script `deploy` di `apps/web/package.json` berpindah direktori ke `apps/web` sebelum menjalankan Wrangler.

---

## Testing

Panduan lengkap: [docs/testing.md](docs/testing.md).

| Type | Tool | Command |
|------|------|---------|
| **Unit** | Vitest + Testing Library | `pnpm test` |
| **E2E** | Playwright | `cd apps/web && npx playwright test` |
| **Type** | TypeScript | `pnpm typecheck` |
| **Lint** | ESLint | `pnpm lint` |

CI pipeline: typecheck → lint → unit tests → production build → D1 migration apply (empty local DB) → Playwright smoke tests.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/) (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

Please ensure all CI checks and the SonarCloud quality gate pass before requesting review.

---

## Security

Jika menemukan kerentanan keamanan, **jangan** buka issue publik.

Opsi:
- Buka **GitHub Security Advisory** — [github.com/eiaiproject/Ledjer/security/advisories](https://github.com/eiaiproject/Ledjer/security/advisories)
- Email maintainer langsung (lihat commit history)

Lihat [SECURITY.md](SECURITY.md) untuk kebijakan lengkap.

---

## License

Proprietary. All rights reserved.

Tidak boleh didistribusikan, dimodifikasi, atau digunakan tanpa izin tertulis dari pemilik.

---

*Built with React, Cloudflare Workers, and D1.*
