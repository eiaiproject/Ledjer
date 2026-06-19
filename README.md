# Ledjer

Sistem pembukuan dan akuntansi berbasis web untuk bisnis kecil dan menengah di Indonesia. Dibangun dengan arsitektur modern menggunakan Supabase sebagai backend dan React sebagai frontend, Ledjer menyediakan pencatatan transaksi, pengelolaan akun, manajemen persediaan, serta pelaporan keuangan standar akuntansi dalam satu platform yang terintegrasi.

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Tech Stack](#tech-stack)
- [Design System](#design-system)
- [Struktur Proyek](#struktur-proyek)
- [Persiapan Lingkungan Pengembangan](#persiapan-lingkungan-pengembangan)
- [Konfigurasi Supabase](#konfigurasi-supabase)
- [Schema Database](#schema-database)
- [Alur Transaksi dan Jurnal Akuntansi](#alur-transaksi-dan-jurnal-akuntansi)
- [Manajemen Persediaan](#manajemen-persediaan)
- [Laporan Keuangan](#laporan-keuangan)
- [Sistem Izin](#sistem-izin)
- [Keamanan](#keamanan)
- [Pengujian](#pengujian)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Fitur Utama

### Pencatatan Transaksi

Ledjer mendukung 14 jenis transaksi yang mencakup seluruh aktivitas keuangan operasional bisnis:

**Transaksi Kas:**
- Penjualan Tunai (`cash_sale`)
- Pembelian Tunai (`cash_purchase`)
- Terima Piutang (`receive_receivable`)
- Bayar Utang (`pay_payable`)
- Bayar Beban (`expense_payment`)
- Modal Pemilik (`owner_capital`)
- Penarikan Tunai (`owner_draw`)
- Transfer Antar Rekening Bank (`cash_transfer`)

**Transaksi Kredit:**
- Penjualan Kredit (`credit_sale`) dengan status pembayaran lunas, belum dibayar, atau sebagian dibayar
- Pembelian Kredit (`credit_purchase`) dengan status pembayaran lunas, belum dibayar, atau sebagian dibayar

**Penyesuaian:**
- Penyesuaian (`simple_adjustment`)

Setiap transaksi yang diposting akan otomatis membuat jurnal akuntansi (general ledger) yang seimbang (total debit sama dengan total kredit).

### Manajemen Persediaan

Sistem persediaan terintegrasi dengan pencatatan transaksi:

- CRUD produk dengan informasi kode, nama, harga beli, harga jual, dan stok saat ini
- Pemilihan produk saat mencatat transaksi pembelian atau penjualan
- Pencatatan kuantitas dan harga satuan per transaksi
- Perhitungan Harga Pokok Penjualan (HPP) menggunakan metode **Weighted Average**
- Pencatatan riwayat pergerakan stok (stock movements)
- Validasi stok negatif yang mencegah penjualan melebihi jumlah tersedia

### Pengelolaan Akun (Chart of Accounts)

- Daftar akun standar yang dibuat otomatis saat organisasi baru dibuat
- 8 tipe akun: Aset, Liabilitas, Ekuitas, Pendapatan, HPP, Beban Operasional, Pendapatan Lain, Beban Lain
- Saldo normal: Debit atau Kredit per tipe akun
- Penanda akun kas (`is_cash_account`) untuk deteksi akun kas/bank
- Penanda akun sistem yang tidak dapat dihapus
- Kode akun unik per organisasi

### Pelaporan Keuangan

Empat laporan keuangan standar yang tersedia:

1. **General Ledger (Buku Besar)** - Rincian transaksi per akun dengan saldo berjalan
2. **Trial Balance (Neraca Saldo)** - Ringkasan saldo debit dan kredit seluruh akun
3. **Profit & Loss (Laba Rugi)** - Pendapatan, beban, HPP, dan laba/rugi bersih
4. **Balance Sheet (Neraca)** - Posisi keuangan: aset, liabilitas, ekuitas, dan saldo laba

### Manajemen Pengguna dan Tim

- Autentikasi menggunakan email dan password melalui Supabase Auth
- Sistem organisasi multi-pengguna (multi-tenant)
- Peran: Owner dan Staff dengan hak akses berbeda
- Undangan anggota tim melalui email
- Pengaturan hak akses granular (6 izin terpisah)

### Fitur Lainnya

- Dashboard dengan ringkasan keuangan (saldo kas, pendapatan, beban, laba/rugi, piutang, utang)
- Format mata uang Rupiah Indonesia (IDR) dengan locale `id-ID`
- Pencarian dan filter transaksi
- Detail transaksi dengan tampilan jurnal akuntansi
- Riwayat pergerakan stok per produk
- Log audit untuk setiap perubahan data penting
- Toast notifications untuk feedback pengguna
- Loading skeleton untuk UX yang lebih baik

---

## Arsitektur Sistem

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  React Frontend │────▶│  Supabase Edge  │────▶│  PostgreSQL DB  │
│  (Vite + TS)    │     │  Functions (RPC)│     │  + RLS Policies │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │                ┌─────────────────┐            │
        └───────────────▶│  Supabase Auth  │◀───────────┘
                         │  (JWT + RLS)    │
                         └─────────────────┘
```

**Alur Data:**
1. Pengguna berinteraksi dengan frontend (React + TypeScript)
2. Frontend melakukan RPC call ke Supabase Edge Functions
3. Edge Functions menjalankan logika bisnis (validasi, perhitungan jurnal)
4. Data disimpan di PostgreSQL dengan Row Level Security (RLS)
5. Autentikasi dan autorisasi ditangani oleh Supabase Auth

---

## Tech Stack

### Frontend

| Komponen | Teknologi | Versi |
|----------|-----------|-------|
| Framework | React | 19 |
| Bahasa | TypeScript | 5.x (strict mode) |
| Bundler | Vite | 8 |
| Styling | Tailwind CSS | 4 |
| Routing | React Router DOM | 7 |
| State Management | TanStack React Query | 5 |
| Form Handling | React Hook Form | 7 |
| Schema Validation | Zod | 4 |
| Icons | Lucide React | - |
| Utilities | clsx + tailwind-merge | - |

### Backend

| Komponen | Teknologi |
|----------|-----------|
| Platform | Supabase (PostgreSQL + Edge Functions) |
| Database | PostgreSQL 15 |
| Auth | Supabase Auth (JWT) |
| Security | Row Level Security (RLS) |
| RPC | PostgreSQL Functions (plpgsql) |
| API | Supabase REST API + RPC |

### Development Tools

| Komponen | Teknologi |
|----------|-----------|
| Package Manager | pnpm 10 (workspaces) |
| Linting | ESLint 10 |
| Type Checking | TypeScript (strict) |
| Testing | Vitest + Testing Library |
| Database Migrations | Supabase CLI |

---

## Design System

Ledjer menggunakan desain **Natural Earth** yang terinspirasi dari alam Indonesia:

### Warna

| seri | Deskripsi | Penggunaan |
|------|-----------|------------|
| **Wood** | Coklat kayu | Sidebar, header, tombol utama |
| **Leaf** | Hijau daun | Status sukses, indikator pertumbuhan |
| **Cream** | Krem kertas | Background halaman |
| **Clay** | Merah tanah | Peringatan, aksen |
| **Honey** | Madu | Fitur premium, CTA |
| **Sky** | Biru langit | Info, aksen |

### Tipografi

- **Heading**: Lora (serif) - kesan hangat dan profesional
- **Body**: Plus Jakarta Sans - modern dan mudah dibaca
- **Mono**: JetBrains Mono - untuk kode dan angka

### Komponen UI

Tersedia di `src/components/ui/`:

| Komponen | Deskripsi |
|----------|-----------|
| `Button` | 6 varian (primary, secondary, success, danger, ghost, outline) |
| `Input` | Dengan label, error, prefix/suffix |
| `Select` | Dropdown dengan label dan validasi |
| `Badge` | 5 varian status dengan dot indicator |
| `Card` | Container dengan header, content, footer |
| `Modal` | Dialog dengan focus trap dan ESC |
| `ConfirmDialog` | Konfirmasi aksi destruktif |
| `StatCard` | KPI card untuk dashboard |
| `Spinner` | Loading indicator |
| `EmptyState` | State kosong |
| `ErrorState` | Error dengan retry |
| `Skeleton` | Loading placeholder |

---

## Struktur Proyek

```
Ledjer/
├── apps/
│   └── web/                              # Frontend aplikasi
│       └── src/
│           ├── components/
│           │   ├── error-boundary.tsx    # Error boundary
│           │   └── ui/                   # Komponen UI (14 komponen)
│           │       ├── badge.tsx
│           │       ├── button.tsx
│           │       ├── card.tsx
│           │       ├── confirm-dialog.tsx
│           │       ├── empty-state.tsx
│           │       ├── error-state.tsx
│           │       ├── input.tsx
│           │       ├── modal.tsx
│           │       ├── select.tsx
│           │       ├── skeleton.tsx
│           │       ├── spinner.tsx
│           │       ├── stat-card.tsx
│           │       ├── toast.tsx
│           │       └── index.ts
│           ├── contexts/
│           │   ├── auth.tsx
│           │   └── auth-context.ts
│           ├── hooks/
│           │   └── useOrganization.ts
│           ├── layouts/
│           │   └── dashboard.tsx        # Responsive sidebar layout
│           ├── lib/
│           │   ├── database-types.ts    # Tipe TypeScript dari database
│           │   ├── errors.ts            # Error translation
│           │   ├── profiles.ts          # Profile utilities
│           │   ├── query-client.ts      # TanStack Query client
│           │   ├── rate-limit.ts        # Client-side rate limiting
│           │   ├── sanitize.ts          # Input sanitization
│           │   ├── supabase.ts          # Supabase client init
│           │   ├── transaction-usage.ts # Usage tracking
│           │   ├── transactions.ts      # Transaction utilities
│           │   └── utils.ts             # formatIDR, formatDate, etc.
│           ├── pages/
│           │   ├── dashboard.tsx
│           │   ├── login.tsx
│           │   ├── onboarding.tsx
│           │   ├── register.tsx
│           │   ├── accounts/
│           │   │   └── index.tsx
│           │   ├── products/
│           │   │   └── index.tsx
│           │   ├── reports/
│           │   │   ├── balance-sheet.tsx
│           │   │   ├── general-ledger.tsx
│           │   │   ├── profit-loss.tsx
│           │   │   └── trial-balance.tsx
│           │   ├── settings/
│           │   │   ├── billing.tsx
│           │   │   └── team.tsx
│           │   └── transactions/
│           │       ├── list.tsx
│           │       ├── detail.tsx
│           │       ├── new.tsx
│           │       └── [id].tsx
│           ├── routes/
│           │   └── __root.tsx
│           ├── __tests__/
│           │   ├── setup.ts
│           │   └── smoke.test.ts
│           ├── App.tsx
│           ├── index.css               # Design tokens (Natural Earth)
│           └── main.tsx
├── supabase/
│   ├── config.toml
│   └── migrations/                      # 23 migrasi SQL
├── SECURITY.md                          # Dokumentasi keamanan
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

## Persiapan Lingkungan Pengembangan

### Prasyarat

- Node.js 18 atau lebih baru
- pnpm 10 atau lebih baru
- Docker (untuk Supabase lokal)
- Supabase CLI

### Instalasi

1. Clone repositori:

```bash
git clone https://github.com/username/ledjer.git
cd ledjer
```

2. Instal dependensi:

```bash
pnpm install
```

3. Siapkan environment variables:

```bash
cd apps/web
cp .env .env.local
```

4. Edit `apps/web/.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Jalankan aplikasi:

```bash
pnpm dev
```

Aplikasi tersedia di `http://localhost:5173`.

---

## Konfigurasi Supabase

### Supabase Cloud (Production)

```bash
supabase login
supabase link --project-ref your-project-id
supabase db push
```

### Supabase Lokal (Development)

```bash
supabase start
```

Update `apps/web/.env.local`:

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
```

Supabase Studio: `http://localhost:54323`

---

## Schema Database

### Tabel Utama

| Tabel | Deskripsi |
|-------|-----------|
| `profiles` | Profil pengguna |
| `organizations` | Data organisasi/bisnis |
| `organization_members` | Relasi pengguna dengan organisasi |
| `accounts` | Chart of Accounts |
| `transactions` | Catatan transaksi keuangan |
| `transaction_lines` | Detail baris transaksi |
| `journal_entries` | Header jurnal akuntansi |
| `journal_lines` | Detail debit/kredit jurnal |
| `parties` | Pelanggan dan supplier |
| `products` | Data produk |
| `stock_movements` | Riwayat pergerakan stok |
| `audit_logs` | Log audit perubahan data |
| `rate_limits` | Rate limiting (server-side) |
| `login_attempts` | Tracking percobaan login |

---

## Alur Transaksi dan Jurnal Akuntansi

### Prinsip Dasar

Setiap transaksi yang diposting akan membuat minimal satu journal entry yang terdiri dari dua atau lebih journal lines. Total debit harus sama dengan total kredit (double-entry bookkeeping).

### Contoh Jurnal

#### Penjualan Tunai (Tanpa Produk)
```
Debit:  Kas/Bank (1110-1130)       Rp X
Credit: Pendapatan Usaha (4100)    Rp X
```

#### Penjualan Tunai (Dengan Produk)
```
Entry 1 (Revenue):
Debit:  Kas/Bank (1110-1130)       Rp Harga Jual × Qty
Credit: Pendapatan Usaha (4100)    Rp Harga Jual × Qty

Entry 2 (COGS - otomatis):
Debit:  HPP (5100)                 Rp Harga Beli × Qty
Credit: Persediaan (1300)          Rp Harga Beli × Qty
```

#### Penjualan Kredit (Dengan Produk + Pembayaran Parsial)
```
Entry 1 (Revenue):
Debit:  Kas/Bank (1110-1130)       Rp Jumlah Dibayar
Debit:  Piutang Usaha (1200)       Rp Sisa Piutang
Credit: Pendapatan Usaha (4100)    Rp Total Penjualan

Entry 2 (COGS - otomatis):
Debit:  HPP (5100)                 Rp Harga Beli × Qty
Credit: Persediaan (1300)          Rp Harga Beli × Qty
```

#### Pembelian Tunai (Dengan Produk)
```
Debit:  Persediaan (1300)          Rp X
Credit: Kas/Bank (1110-1130)       Rp X
```

#### Terima Piutang
```
Debit:  Kas/Bank (1110-1130)       Rp X
Credit: Piutang Usaha (1200)       Rp X
```

#### Bayar Utang
```
Debit:  Utang Usaha (2100)         Rp X
Credit: Kas/Bank (1110-1130)       Rp X
```

#### Modal Pemilik
```
Debit:  Kas/Bank (1110-1130)       Rp X
Credit: Modal Pemilik (3100)       Rp X
```

#### Penarikan Tunai (Prive)
```
Debit:  Prive (3300)               Rp X
Credit: Kas/Bank (1110-1130)       Rp X
```

#### Transfer Antar Rekening
```
Debit:  Rekening Tujuan            Rp X
Credit: Rekening Sumber            Rp X
```

---

## Manajemen Persediaan

### Alur Kerja

1. **Setup Produk** - Buat data produk di `/products` dengan harga beli, harga jual
2. **Pencatatan Pembelian** - Stok otomatis bertambah saat pembelian dengan produk
3. **Pencatatan Penjualan** - Stok berkurang dan HPP tercatat otomatis
4. **Monitoring** - Riwayat pergerakan stok melalui modal produk

### Harga Pokok Penjualan (HPP)

Menggunakan metode **Weighted Average**:

```
HPP Baru = ((Stok Lama × Harga Lama) + (Qty Baru × Harga Baru)) / (Stok Lama + Qty Baru)
```

---

## Laporan Keuangan

| Laporan | Deskripsi | Periode |
|---------|-----------|---------|
| General Ledger | Rincian transaksi per akun | Periode tertentu |
| Trial Balance | Ringkasan saldo debit/kredit | Periode tertentu |
| Profit & Loss | Pendapatan - Beban - HPP | Periode tertentu |
| Balance Sheet | Aset = Liabilitas + Ekuitas | Pada tanggal tertentu |

---

## Sistem Izin

### Peran

| Peran | Keterangan |
|-------|------------|
| Owner | Akses penuh ke seluruh fitur |
| Staff | Akses terbatas sesuai pengaturan |

### Hak Akses Staff

| Izin | Deskripsi |
|------|-----------|
| `can_create_transaction` | Membuat transaksi baru |
| `can_view_reports` | Melihat laporan keuangan |
| `can_manage_accounts` | Mengelola daftar akun |
| `can_void_transaction` | Membatalkan transaksi |
| `can_manage_products` | Mengelola data produk |
| `can_view_audit_log` | Melihat log audit |

---

## Keamanan

Lihat [SECURITY.md](SECURITY.md) untuk dokumentasi lengkap.

### Fitur Keamanan

- **Row Level Security (RLS)** - Isolasi data per organisasi
- **Rate Limiting** - Client-side dan server-side
- **Input Sanitization** - Validasi dan sanitasi input
- **Security Headers** - CSP, X-Frame-Options, dll
- **Audit Logging** - Pelacakan semua perubahan data
- **Login Tracking** - Pencatatan percobaan login

---

## Pengujian

```bash
# Jalankan semua test
pnpm test

# Jalankan test dengan watch mode
pnpm test --watch
```

---

## Deployment

### Frontend (Vercel/Netlify)

1. Push kode ke repository
2. Hubungkan ke Vercel/Netlify
3. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build command: `pnpm --filter web build`
5. Output: `apps/web/dist`

### Database (Supabase Cloud)

```bash
supabase login
supabase link --project-ref your-project-id
supabase db push
```

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Data tidak muncul | Cek `VITE_SUPABASE_URL` dan RLS policies |
| Transaksi gagal | Pastikan akun kas/bank benar dan data pelanggan ada |
| Stok tidak update | Pastikan produk dipilih dan kuantitas terisi |
| Laporan kosong | Cek hak akses `can_view_reports` dan status transaksi |
| Migrasi gagal | Cek log error, pastikan tidak ada konflik nama |

---

## Lisensi

ISC License

---

## Kontak

Untuk pertanyaan atau masukan, silakan buka issue di repository.
