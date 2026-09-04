# Ledjer

> Sistem pembukuan *double-entry* untuk UMKM Indonesia. Modern, cloud-native, dan gratis.

Ledjer membantu UMKM mencatat uang masuk dan keluar, lalu menghasilkan laporan keuangan tanpa perlu pengetahuan akuntansi formal. Berjalan di Cloudflare edge network - cepat, aman, dan tanpa manajemen server.

[![CI](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml/badge.svg)](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml)
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

## Features (MVP)

### Pencatatan Transaksi
- **5 jenis transaksi** - uang masuk, uang keluar, transfer kas/bank, modal masuk (setoran pemilik), dan pengambilan pemilik
- **Double-entry bookkeeping** - setiap transaksi otomatis menjadi jurnal debit-kredit yang dipaksa seimbang
- **Void (pembatalan)** - transaksi salah dapat dibatalkan; saldo dan laporan menyesuaikan otomatis dengan jejak audit
- **Idempotency** - kirim ulang form tidak pernah menduplikasi transaksi (key unik per form)

### Akun Kas & Bank
- **Chart of accounts default** - 14 akun standar (Kas, Bank, Modal, Pendapatan, dan beban) dibuat otomatis saat daftar
- **Akun kas/bank tambahan** - buat, ganti nama, dan aktif/nonaktifkan akun kas & rekening bank

### Laporan Keuangan
- **Laba rugi (profit & loss)** - pendapatan, beban, dan laba bersih per periode
- **Neraca (balance sheet)** - posisi aset, liabilitas, dan ekuitas; selalu seimbang
- **Buku besar (general ledger)** - riwayat transaksi per akun dengan saldo berjalan (filter rentang tanggal & akun)

### Operasional
- **Ekspor CSV** - unduh riwayat transaksi (anti formula-injection, UTF-8 BOM)
- **Dashboard** - saldo kas/bank, uang masuk & keluar bulan ini, laba bersih, transaksi terbaru
- **Backup harian otomatis** - snapshot D1 terjadwal ke R2 (cron 03:00 UTC) + restore drill
- **Rate limiting** - proteksi endpoint autentikasi dan transaksi

### Platform
- **Registrasi mandiri** - daftar langsung membuat organisasi + chart of accounts
- **Masuk dengan Google (OAuth)** - opsional; aktif setelah `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` dikonfigurasi
- **Sesi aman** - cookie httpOnly, idle timeout, rotasi token, CSRF origin validation
- **Audit log** - jejak aksi pengguna (transaksi dibuat/dibatalkan, akun dikelola)
- **Indonesian-first** - UI dalam Bahasa Indonesia, mata uang IDR

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, TypeScript 6 |
| **State & Forms** | TanStack React Query, React Hook Form, Zod |
| **API** | Cloudflare Workers via Hono |
| **Database** | Cloudflare D1 (SQLite-based) |
| **Storage** | Cloudflare R2 (backup) |
| **Auth** | Worker-native cookie session + CSRF protection |
| **Monitoring** | Sentry (frontend + worker) |
| **Testing** | Vitest, React Testing Library, Playwright |
| **Package Manager** | pnpm 10 workspaces |
| **CI/CD** | GitHub Actions (CI, auto-deploy, E2E, dependency scan) |

---

## Quick Start

### Prerequisites

- **Node.js** 24+
- **pnpm** 10 - enable via Corepack:
  ```bash
  corepack enable && corepack prepare pnpm@10 --activate
  ```
- **Cloudflare account** - dengan Workers + D1 aktif (untuk deployment)

### Install & Run

```bash
# Clone & install dependencies
git clone https://github.com/eiaiproject/Ledjer.git
cd Ledjer
pnpm install

# Start development server
pnpm dev
```

Aplikasi + Worker API: [http://localhost:5173](http://localhost:5173) — Worker berjalan di dev server yang sama via `@cloudflare/vite-plugin` (`/api/*` same-origin)

### Environment Setup

```bash
cp apps/web/.env.example apps/web/.env.local
```

`VITE_API_BASE_URL` boleh dibiarkan kosong — Worker API berjalan same-origin di dev server (`@cloudflare/vite-plugin`).

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

# Deploy
pnpm deploy                 # Deploy web ke Cloudflare (jalankan pnpm build terlebih dahulu)
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
docs/
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

- [docs/architecture](docs/architecture) - keputusan & diagram arsitektur
- [docs/production](docs/production) - runbook operasional (monitoring, incident response)
- [docs/accounting-rules.md](docs/accounting-rules.md) - aturan & konvensi akuntansi
- [docs/testing.md](docs/testing.md) - panduan & konvensi pengujian
- [CHANGELOG.md](CHANGELOG.md) - riwayat perubahan
- [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) - prosedur pemulihan bencana
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) - lisensi dependensi pihak ketiga

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
| `PASSWORD_PEPPER` | Pepper untuk hashing password |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (opsional, untuk masuk dengan Google) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (opsional) |

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

Please ensure all CI checks pass before requesting review.

---

## Security

Jika menemukan kerentanan keamanan, **jangan** buka issue publik.

Opsi:
- Buka **GitHub Security Advisory** - [github.com/eiaiproject/Ledjer/security/advisories](https://github.com/eiaiproject/Ledjer/security/advisories)
- Email maintainer langsung (lihat commit history)

Lihat [SECURITY.md](SECURITY.md) untuk kebijakan lengkap.

---

## License

Proprietary. All rights reserved.

Tidak boleh didistribusikan, dimodifikasi, atau digunakan tanpa izin tertulis dari pemilik.

---

*Built with React, Cloudflare Workers, and D1.*