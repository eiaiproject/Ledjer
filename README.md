<div align="center">

# Ledjer

**Sistem pembukuan double-entry untuk UMKM Indonesia.**
Catat transaksi, kelola persediaan, hasilkan laporan keuangan — tanpa spreadsheet.

[![CI](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml/badge.svg)](https://github.com/eiaiproject/Ledjer/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/eiaiproject/Ledjer/releases)
[![License: ISC](https://img.shields.io/badge/license-ISC-green)](LICENSE)
[![Status](https://img.shields.io/badge/status-development-orange)]()

[![pnpm](https://img.shields.io/badge/pnpm-10-yellow)](https://pnpm.io)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E)](https://supabase.com)

[Demo](#demo) · [Quick Start](#quick-start) · [Dokumentasi](#dokumentasi) · [Berkontribusi](#berkontribusi)

</div>

---

## Daftar Isi

- [Mengapa Ledjer?](#mengapa-ledjer)
- [Fitur](#fitur)
- [Demo](#demo)
- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Menjalankan](#menjalankan)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Accounting Rules](#accounting-rules)
- [Security](#security)
- [Auth Flows](docs/auth-flow.md)
- [Deployment](#deployment)
- [Distribusi Source](#distribusi-source)
- [Roadmap](#roadmap)
- [Known Limitations](#known-limitations)
- [Berkontribusi](#berkontribusi)
- [Lisensi](#lisensi)
- [Acknowledgments](#acknowledgments)

---

## Mengapa Ledjer?

UMKM Indonesia butuh pembukuan yang **sesuai PSAK**, **multi-user** untuk owner + staff, dan **cukup ringan** untuk dijalankan di HP. Spreadsheet tidak bisa mengunci saldo per-user; software akuntansi enterprise terlalu mahal dan terlalu kompleks.

Ledjer adalah jalan tengah: **double-entry bookkeeping** yang valid secara akuntansi, dengan **permission granular** per staff, dijalankan di browser dengan backend Supabase. Owner tidak perlu install apa-apa di laptop; staff cukup dapat invite via email.

**Target pengguna:** toko retail, distributor, bisnis jasa skala UMKM dengan omzet di bawah Rp 1 Miliar / bulan, 1–10 staff, dan kebutuhan laporan bulanan untuk bank atau kantor pajak.

---

## Fitur

### Pencatatan Transaksi — 14 jenis

Setiap transaksi diposting melalui SECURITY DEFINER RPC dan otomatis menghasilkan jurnal berimbang (Σ debit = Σ credit).

| Kategori | Jenis Transaksi |
|----------|-----------------|
| **Kas** | Penjualan Tunai, Pembelian Tunai, Terima Piutang, Bayar Utang, Bayar Beban, Modal Pemilik, Penarikan Tunai, Transfer Antar Rekening |
| **Kredit** | Penjualan Kredit, Pembelian Kredit — belum dibayar atau sebagian |
| **Penyesuaian** | Penyesuaian Manual (owner only) |
| **Saldo Awal** | Saldo Awal Kas / Piutang / Utang (hanya saat onboarding) |

### Manajemen Persediaan — Weighted Average

- CRUD produk dengan kode, nama, harga beli, harga jual, stok, stok minimum
- **Harga Pokok Penjualan (HPP)** dihitung dengan metode *weighted average* yang benar untuk pembelian, pembelian-void, penjualan, dan penjualan-void
- Riwayat lengkap setiap pergerakan stok (`stock_movements`)
- Validasi stok negatif di-trigger

### Pelaporan Keuangan — 4 laporan standar

| Laporan | Output |
|---------|--------|
| General Ledger | Rincian transaksi per akun dengan saldo berjalan |
| Trial Balance | Ringkasan saldo debit dan kredit seluruh akun aktif |
| Profit & Loss | Pendapatan, HPP, beban operasional, pendapatan lain, beban lain |
| Balance Sheet | Aset = Liabilitas + Ekuitas + Laba Tahun Berjalan |

### Sistem Izin — Granular per-staff

| Izin | Owner | Staff (configurable) |
|------|-------|----------------------|
| `can_create_transaction` | ✅ | optional |
| `can_view_reports` | ✅ | optional |
| `can_manage_accounts` | ✅ | ❌ |
| `can_void_transaction` | ✅ | optional |
| `can_manage_products` | ✅ | optional |
| `can_view_audit_log` | ✅ | optional |

### Fitur Lainnya

- **Dashboard** dengan ringkasan kas, pendapatan, beban, laba bulan berjalan
- **Multi-tenant**: organisasi terpisah, data terisolasi via RLS
- **Invite staff** via email (hanya user dengan email terkonfirmasi)
- **Audit log** untuk setiap mutasi finansial — hanya owner yang bisa baca
- **Rate limiting** per identifier (`rate_limits`) dan tracking percobaan login (`login_attempts`)
- **Format Rupiah** (IDR) dengan input numerik lokal
- **Onboarding wizard** untuk setup bisnis baru (chart of accounts + saldo awal)
- **Password recovery flow** — "Lupa password?" di halaman login → email recovery → setel password baru di `/reset-password`. Dilindungi anti account-enumeration (respon sukses generik) dan rate-limit (3 percobaan per 15 menit per email).

---

## Demo

> Screenshot dan demo live belum tersedia. Lihat [Quick Start](#quick-start) untuk menjalankan aplikasi secara lokal.

---

## Quick Start

```bash
# 1. Clone dan install dependency
git clone https://github.com/eiaiproject/Ledjer.git
cd Ledjer
pnpm install

# 2. Setup env (lihat bagian Konfigurasi di bawah)
cp apps/web/.env.example apps/web/.env.local
# edit apps/web/.env.local dengan Supabase URL + anon key

# 3. Jalankan dev server
pnpm dev
# → buka http://localhost:5173
```

Butuh backend lokal? Lihat [Supabase Local Stack](#supabase-local-stack-optional).

---

## Tech Stack

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Frontend | React | 19 |
| Bundler | Vite | 8 |
| Styling | Tailwind CSS | 4 |
| Routing | React Router DOM | 7 |
| State | TanStack React Query | 5 |
| Forms | React Hook Form + Zod | 7 / 4 |
| Type system | TypeScript | 6 |
| Backend | Supabase (Postgres 17, Auth, RLS) | latest |
| RPC | PostgreSQL Functions (PL/pgSQL) | — |
| Frontend testing | Vitest + Testing Library | 3 / 16 |
| Package manager | pnpm | 10 (workspaces) |

---

## Prasyarat

- **Node.js** ≥ 20
- **pnpm** ≥ 10 (`npm install -g pnpm`)
- **Git** ≥ 2.30
- Untuk backend lokal: **Docker** + **Supabase CLI** ([install guide](https://supabase.com/docs/guides/cli))
- Untuk produksi / hosted: akun **Supabase** (free tier cukup untuk development)

---

## Instalasi

```bash
git clone https://github.com/eiaiproject/Ledjer.git
cd Ledjer
pnpm install --frozen-lockfile
```

Output yang diharapkan:
```
Scope: all 5 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in <ms> using pnpm v10
```

---

## Konfigurasi

### Frontend (`apps/web/.env.local`)

Salin template lalu edit:

```bash
cp apps/web/.env.example apps/web/.env.local
```

```env
# URL Supabase project (hosted atau lokal)
VITE_SUPABASE_URL=https://your-project.supabase.co

# Anon public key — aman di-commit, BUKAN service-role
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

**Jangan** copy `service_role` key ke frontend. Service role bypass RLS dan hanya boleh dipakai di server-side / migration.

### Backend (Supabase)

**Hosted (paling cepat untuk coba-coba):**

1. Buat project baru di [supabase.com/dashboard](https://supabase.com/dashboard)
2. Settings → API → copy `URL` dan `anon public key`
3. Paste ke `apps/web/.env.local`

**Local (untuk development):**

```bash
# Install Supabase CLI (lihat https://supabase.com/docs/guides/cli)
brew install supabase/tap/supabase   # macOS
# atau download dari https://github.com/supabase/cli/releases

# Start local stack (Postgres + GoTrue + PostgREST + Storage)
supabase start --workdir supabase

# Apply migrations
supabase db reset --workdir supabase --no-seed
```

URL lokal default: `http://localhost:54321`. Password Postgres: `postgres`.

---

## Menjalankan

### Dev server

```bash
pnpm dev
# → http://localhost:5173
```

### Production build

```bash
pnpm --filter web build
# → apps/web/dist/
```

Output `apps/web/dist/` siap di-deploy ke static hosting (Vercel, Netlify, Cloudflare Pages, nginx).

---

## Testing

### Frontend (Vitest)

```bash
pnpm --filter web typecheck   # TypeScript compilation
pnpm --filter web lint        # ESLint
pnpm --filter web test        # 88 unit tests across 9 files
pnpm --filter web build       # Production build
```

### SQL tests (perlu Supabase lokal)

```bash
supabase start --workdir supabase
supabase db reset --workdir supabase --no-seed

# Urutan suite didefinisikan sekali di supabase/tests/run_all.sql.
# ON_ERROR_STOP=1 membuat setiap RAISE EXCEPTION (test gagal) langsung exit non-zero.
# Jalankan dari root repo agar path \i di run_all.sql resolve dengan benar.
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
```

Test SQL menggunakan `RAISE EXCEPTION` (bukan `RAISE WARNING`) sehingga setiap kegagalan langsung membuat `psql` exit non-zero. Cocok untuk CI gating.

CI workflow menjalankan semua step ini di `ubuntu-latest` GitHub runner — lihat [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Project Structure

```
Ledjer/
├── apps/
│   └── web/                              # Frontend React 19 + Vite
│       ├── src/
│       │   ├── components/ui/            # 20+ komponen UI (Button, Card, Input, dsb)
│       │   ├── contexts/                 # AuthContext + AuthProvider
│       │   ├── hooks/                    # Custom hooks
│       │   ├── layouts/                  # DashboardLayout (sidebar)
│       │   ├── lib/                      # supabase client, errors, rate-limit, utils
│       │   ├── pages/                    # Dashboard, Transaksi, Akun, Produk, Laporan, Settings
│       │   └── __tests__/                # Vitest unit + integration tests
│       └── package.json
├── packages/                             # Workspace packages
│   └── database-types/                   # TypeScript types generated from Supabase
├── supabase/
│   ├── migrations/                       # 57 migrasi SQL (applied in order)
│   ├── tests/                            # 1 helper + 9 suite + run_all.sql (runner)
│   └── config.toml                       # Supabase CLI config
├── scripts/
│   └── check-package-clean.sh            # Packaging guard untuk source archive
├── docs/
│   ├── accounting-rules.md               # Referensi aturan jurnal per transaksi
│   ├── production-readiness.md           # Checklist production
│   ├── qa-checklist.md                   # QA scenarios
│   └── engineering-report-*.md           # Hardening pass reports
└── .github/
    └── workflows/
        └── ci.yml                        # Frontend + Supabase + packaging guards
```

---

## Accounting Rules

Setiap jenis transaksi menghasilkan jurnal tertentu. Dokumentasi lengkap ada di [`docs/accounting-rules.md`](docs/accounting-rules.md).

### Ringkasan jurnal per transaksi

<details>
<summary><strong>Cash Sale</strong> — Penjualan tunai</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Kas/Bank (1110) | Rp X | |
| Pendapatan (4100+) | | Rp X |

Dengan produk → jurnal tambahan HPP:

| Akun | Debit | Credit |
|------|-------|--------|
| HPP (5100) | Rp Harga Beli × Qty | |
| Persediaan (1300) | | Rp Harga Beli × Qty |

</details>

<details>
<summary><strong>Credit Sale</strong> — Penjualan kredit (piutang)</summary>

| Status | Debit | Credit |
|--------|-------|--------|
| Unpaid | Piutang Usaha (1200) | Pendapatan (4100+) |
| Partial | Kas/Bank + Piutang Usaha | Pendapatan (4100+) |

</details>

<details>
<summary><strong>Receive Receivable</strong> — Terima piutang</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Kas/Bank (1110) | Rp X | |
| Piutang Usaha (1200) | | Rp X |

</details>

<details>
<summary><strong>Cash Purchase</strong> — Pembelian tunai</summary>

Tanpa produk:
| Akun | Debit | Credit |
|------|-------|--------|
| Beban / Persediaan (5100+) | Rp X | |
| Kas/Bank (1110) | | Rp X |

Dengan produk:
| Akun | Debit | Credit |
|------|-------|--------|
| Persediaan (1300) | Rp X | |
| Kas/Bank (1110) | | Rp X |

</details>

<details>
<summary><strong>Credit Purchase</strong> — Pembelian kredit (utang)</summary>

| Status | Debit | Credit |
|--------|-------|--------|
| Unpaid | Persediaan / Beban | Utang Usaha (2100) |
| Partial | Persediaan / Beban | Kas/Bank + Utang Usaha |

</details>

<details>
<summary><strong>Pay Payable</strong> — Bayar utang</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Utang Usaha (2100) | Rp X | |
| Kas/Bank (1110) | | Rp X |

</details>

<details>
<summary><strong>Expense Payment</strong> — Bayar beban operasional</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Beban (6xxx) | Rp X | |
| Kas/Bank (1110) | | Rp X |

</details>

<details>
<summary><strong>Owner Capital / Draw</strong></summary>

**Modal masuk:**
| Akun | Debit | Credit |
|------|-------|--------|
| Kas/Bank | Rp X | |
| Modal Pemilik (3100) | | Rp X |

**Prive (tarik tunai):**
| Akun | Debit | Credit |
|------|-------|--------|
| Prive (3300) | Rp X | |
| Kas/Bank | | Rp X |

</details>

<details>
<summary><strong>Cash Transfer</strong> — Antar rekening</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Rekening Tujuan | Rp X | |
| Rekening Sumber | | Rp X |

</details>

<details>
<summary><strong>Void / Reversal</strong></summary>

Membatalkan transaksi yang sudah diposting:

1. Buat jurnal reversal (debit ↔ credit dibalik) berlabel `entry_type = 'reversal'`
2. Status transaksi → `voided`
3. Stok dikembalikan jika transaksi melibatkan produk
4. Baris ditulis ke `audit_logs` dengan `action = 'void'`

</details>

---

## Security

Ledjer memisahkan lapisan keamanan agar setiap ancaman ditangani di level yang tepat.

| Layer | Implementasi |
|-------|-------------|
| Auth | Supabase Auth (JWT, refresh token rotation) |
| Data isolation | Row Level Security (RLS) — setiap tabel terisolasi per organisasi via `is_org_member()` |
| RPC safety | `SECURITY DEFINER` + `SET search_path = public` pada setiap financial RPC |
| Permission checks | `has_permission()` dipanggil di setiap RPC (create / void / view reports) |
| Audit | `audit_logs` mencatat semua aksi finansial; hanya owner yang bisa baca |
| Rate limiting | `rate_limits` + `check_rate_limit()` (per identifier, per action) |
| Login tracking | `login_attempts` table + `record_login_attempt()` untuk deteksi brute-force |
| Input sanitization | Zod schema di frontend + server-side validation di setiap RPC |
| No direct writes | Client tidak punya INSERT / UPDATE / DELETE policy di financial tables — semua mutasi via RPC |
| Internal helpers | `validate_product_sale_accounts`, `recalculate_product_average_cost`, `record_stock_movement` di-REVOKE dari `anon` / `authenticated` — hanya callable dari SECURITY DEFINER function lain |
| Password recovery | `resetPasswordForEmail` + dedicated `/reset-password` route; **same generic success message regardless of email validity** (anti account-enumeration); client rate limit 3/15min per email via `RATE_LIMITS.passwordReset`; Supabase auth rate limit on top |

### Yang TIDAK boleh dilakukan oleh client

- ❌ Direct INSERT / UPDATE / DELETE ke `transactions`, `journal_entries`, `journal_lines`, `stock_movements`, `audit_logs`
- ❌ Bypass `has_permission()` dengan direct RPC call (fungsi raise exception)
- ❌ Lihat transaksi organisasi lain (RLS `is_org_member(org_id)` memblokir)
- ❌ Post opening balance setelah onboarding selesai (`post_opening_balance` raise exception)
- ❌ Void transaksi tanpa izin `can_void_transaction`
- ❌ Probe apakah suatu email terdaftar via "Lupa password?" — server selalu merespons sama; tidak ada kebocoran informasi akun

---

## Deployment

### Frontend (static hosting)

Build output: `apps/web/dist/`. Bisa deploy ke:

| Platform | Konfigurasi |
|----------|-------------|
| Vercel | Auto-detect Vite; build command `pnpm --filter web build` |
| Netlify | Build `pnpm --filter web build`, publish `apps/web/dist` |
| Cloudflare Pages | Build command sama, output sama |
| Self-hosted (nginx) | Copy `apps/web/dist/` ke web root, set SPA fallback |

**Environment variables yang harus di-set di hosting:**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**TIDAK** set `SUPABASE_SERVICE_ROLE_KEY` di frontend hosting. Service role bypass RLS dan harus tetap di server side / migration only.

### Database (Supabase Cloud)

```bash
# 1. Login
supabase login

# 2. Link ke project
supabase link --project-ref your-project-id

# 3. Apply migrations
supabase db push
```

Atau via dashboard: SQL Editor → paste migration files satu per satu (urut berdasarkan timestamp di filename).

**Penting — Auth redirect URLs.** Migration `20260618_000000_create_rls_policies.sql` (dan migration auth) menyiapkan `auth.additional_redirect_urls` di `supabase/config.toml`. Supabase hanya mengizinkan redirect ke URL yang ada di whitelist tersebut. Pastikan URL produksi dan path recovery tercantum:

```
[auth]
additional_redirect_urls = [
  "https://app.ledjer.id",
  "https://app.ledjer.id/auth/callback",       # email confirmation + recovery
  "http://localhost:5173",                     # dev
  "http://localhost:5173/auth/callback",       # dev
]
```

Path `/auth/callback` menerima semua tipe OTP Supabase (`signup`, `recovery`, `magiclink`, `email_change`) — query string `?type=recovery` membedakan recovery dari signup dan route ke `/reset-password`. Detail lengkap: lihat `auth-callback.tsx` dan `reset-password.tsx`.

---

## Distribusi Source

Untuk share source code sebagai tarball / zip (review, handoff, backup), gunakan `git archive` atau `git ls-files` — keduanya otomatis hormati `.gitignore`.

```bash
# Tarball (preferred)
git archive --format=tar.gz \
  --output=ledjer-src.tar.gz \
  --worktree-attributes \
  HEAD

# Zip (alternative)
git ls-files | zip -@ ledjer-src.zip
```

**Otomatis dikecualikan** dari hasil archive:

- `.git`, `.gitignore` tetap di-track
- `node_modules`, `dist`, `.turbo`, `coverage`
- `.env`, `.env.local`, `.env.*` (kecuali `.env.example`)
- `.DS_Store`, `__MACOSX`
- `supabase/.temp`, `supabase/.branches`, `supabase/.env`

### Packaging guard

Sebelum distribusi, jalankan:

```bash
./scripts/check-package-clean.sh                       # inspect git ls-files
./scripts/check-package-clean.sh ledjer-src.tar.gz     # inspect a tarball
./scripts/check-package-clean.sh ledjer-src.zip        # inspect a zip
```

Exit code non-zero jika ada forbidden path. CI menjalankan guard ini sebagai `guard-package-clean` job di setiap push.

---

## Roadmap

Track进展 di [GitHub Projects](https://github.com/eiaiproject/Ledjer/projects).

| Priority | Item | Status |
|----------|------|--------|
| 🔴 P0 | Production launch blockers (CI green, env config, error monitoring) | 🚧 |
| 🟠 P1 | Export laporan ke PDF dan Excel | 📋 Planned |
| 🟠 P1 | Closing entries otomatis (year-end retained earnings) | 📋 Planned |
| 🟡 P2 | Pencetakan faktur (invoice) | 📋 Planned |
| 🟡 P2 | Rekonsiliasi bank (import CSV mutasi rekening) | 📋 Planned |
| 🟡 P2 | Invoice-level AR/AP tracking (saat ini party-level) | 📋 Planned |
| 🟢 P3 | Integrasi payment gateway (Midtrans, Xendit) | 💭 Considering |
| 🟢 P3 | Pajak otomatis (PPN, PPh 21 / 23 / final) | 💭 Considering |
| 🟢 P3 | Multi-currency | 💭 Considering |
| 🟢 P3 | Multi-gudang (multi-location inventory) | 💭 Considering |
| 🟢 P3 | Mobile app (React Native) | 💭 Considering |

Legend: 🚧 In progress · 📋 Planned · 💭 Considering

---

## Known Limitations

1. **Tidak ada invoice-level AR/AP tracking** — saat ini tracking per party (customer / supplier), belum per invoice individual.
2. **Tidak ada report export** (CSV / PDF) — laporan hanya bisa dilihat di aplikasi.
3. **Tidak ada automated closing entries** — laba ditahan harus dihitung manual di awal tahun buku baru.
4. **Tidak ada multi-currency** — semua dalam IDR.
5. **Tidak ada payment gateway integration** — pencatatan transfer / QRIS manual via `receive_receivable` atau `cash_transfer`.
6. **Tidak ada automatic tax** — PPN / PPh harus dihitung dan dicatat manual via `expense_payment` atau `simple_adjustment`.
7. **Indonesian business context only** — chart of accounts dan terminologi spesifik Indonesia; belum support English / multi-region.
8. **No mobile app** — web responsive, tapi belum native iOS / Android.
9. **No automated E2E tests** — saat ini unit + integration only; Playwright / Cypress belum di-setup.

---

## Berkontribusi

Kontribusi welcome! Ikuti langkah berikut:

### Setup lokal

1. **Fork** repo ini
2. **Clone** fork kamu: `git clone git@github.com:<username>/Ledjer.git`
3. Buat branch: `git checkout -b feature/nama-fitur`
4. Install: `pnpm install --frozen-lockfile`
5. Setup `.env.local` (lihat [Konfigurasi](#konfigurasi))
6. Jalankan dev: `pnpm dev`
7. Tulis kode + test
8. Pastikan semua check hijau:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build

# SQL tests (perlu Supabase lokal)
supabase start --workdir supabase
supabase db reset --workdir supabase --no-seed
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
```

### Commit convention

Gunakan [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(web): add export PDF for profit-loss report
fix(sql): correct pay_payable journal direction
docs(repo): update production-readiness checklist
test(sql): add behavioural test for opening-balance guard
chore(repo): bump vite to 8.1.0
refactor(web): split transactions page into smaller components
```

Scopes yang umum: `web`, `sql`, `ci`, `docs`, `repo`.

### Pull Request

1. Push branch: `git push origin feature/nama-fitur`
2. Buka PR ke `main` di [github.com/eiaiproject/Ledjer](https://github.com/eiaiproject/Ledjer)
3. Isi template PR (apa yang berubah, screenshot jika UI, cara test)
4. Tunggu CI hijau + review
5. Merge setelah approved

### Reporting bugs

Buka [GitHub Issue](https://github.com/eiaiproject/Ledjer/issues/new?template=bug_report.md) dengan:
- Langkah reproduksi
- Expected vs actual
- Screenshot / log error
- Browser + OS version

### Requesting features

Buka [GitHub Issue](https://github.com/eiaiproject/Ledjer/issues/new?template=feature_request.md) dengan:
- Use case (siapa, kapan, kenapa)
- Acceptance criteria
- Alternatif yang sudah dipertimbangkan

---

## Lisensi

[ISC License](LICENSE) © 2026 EIAI Project

Bebas digunakan untuk proyek komersial maupun personal. Attribution tidak wajib tapi diappreciate.

---

## Acknowledgments

- [Supabase](https://supabase.com) — Postgres + Auth + RLS platform yang membuat multi-tenant secure jadi mudah
- [shadcn/ui](https://ui.shadcn.com) — inspirasi komponen UI
- [Tailwind CSS](https://tailwindcss.com) — utility-first styling
- [TanStack Query](https://tanstack.com/query) — server state management
- [PSAK](https://www.iaiglobal.or.id) — Standar Akuntansi Keuangan Indonesia yang jadi rujukan aturan jurnal

---

<div align="center">

**Ledjer** dibuat dengan ❤️ untuk UMKM Indonesia.

[⬆ Kembali ke atas](#ledjer)

</div>
