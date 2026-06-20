# Ledjer

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-ISC-green)
![Status](https://img.shields.io/badge/status-development-orange)
![pnpm](https://img.shields.io/badge/pnpm-10-yellow)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E)

> Sistem pembukuan dan akuntansi berbasis web untuk bisnis kecil dan menengah di Indonesia.

---

## Deskripsi

Ledjer adalah platform akuntansi web yang dirancang untuk membantu bisnis kecil dan menengah di Indonesia mengelola keuangan dengan cara yang terstruktur dan sesuai standar akuntansi.

Dibangun dengan arsitektur modern menggunakan **Supabase** sebagai backend dan **React** sebagai frontend, Ledjer menyediakan pencatatan transaksi, pengelolaan akun, manajemen persediaan, serta pelaporan keuangan dalam satu platform yang terintegrasi.

### Masalah yang Diselesaikan

- Banyak bisnis kecil masih mengelola keuangan dengan spreadsheet atau buku tulis
- Sulitnya membuat laporan keuangan standar (Neraca, Laba Rugi) tanpa software akuntansi yang mahal
- Kebutuhan pencatatan double-entry bookkeeping yang benar namun tetap mudah digunakan
- Manajemen persediaan yang terhubung langsung dengan pencatatan keuangan

---

## Fitur Utama

### Pencatatan Transaksi

Mendukung **14 jenis transaksi** yang mencakup seluruh aktivitas keuangan operasional:

| Kategori | Jenis Transaksi |
|----------|-----------------|
| **Kas** | Penjualan Tunai, Pembelian Tunai, Terima Piutang, Bayar Utang, Bayar Beban, Modal Pemilik, Penarikan Tunai, Transfer Antar Rekening |
| **Kredit** | Penjualan Kredit, Pembelian Kredit (dengan status lunas/parsial) |
| **Penyesuaian** | Penyesuaian (Adjustment) |

Setiap transaksi yang diposting otomatis membuat jurnal akuntansi (general ledger) yang seimbang.

### Manajemen Persediaan

- CRUD produk dengan informasi kode, nama, harga beli, harga jual, dan stok
- Perhitungan Harga Pokok Penjualan (HPP) menggunakan metode **Weighted Average**
- Pencatatan riwayat pergerakan stok (stock movements)
- Validasi stok negatif

### Pengelolaan Akun (Chart of Accounts)

- 8 tipe akun: Aset, Liabilitas, Ekuitas, Pendapatan, HPP, Beban Operasional, Pendapatan Lain, Beban Lain
- Daftar akun standar yang dibuat otomatis saat organisasi baru dibuat
- Penanda akun kas (`is_cash_account`) untuk deteksi akun kas/bank

### Pelaporan Keuangan

| Laporan | Deskripsi |
|---------|-----------|
| **General Ledger** | Rincian transaksi per akun dengan saldo berjalan |
| **Trial Balance** | Ringkasan saldo debit dan kredit seluruh akun |
| **Profit & Loss** | Pendapatan, beban, HPP, dan laba/rugi bersih |
| **Balance Sheet** | Posisi keuangan: aset, liabilitas, ekuitas, dan saldo laba |

### Sistem Izin dan Tim

- Autentikasi menggunakan email dan password (Supabase Auth)
- Multi-pengguna (multi-tenant) dengan sistem organisasi
- Peran: **Owner** dan **Staff** dengan hak akses granular (6 izin terpisah)
- Undangan anggota tim melalui email

### Fitur Lainnya

- Dashboard dengan ringkasan keuangan (saldo kas, pendapatan, beban, laba/rugi, piutang, utang)
- Format mata uang Rupiah Indonesia (IDR)
- Pencarian dan filter transaksi
- Detail transaksi dengan tampilan jurnal akuntansi
- Log audit untuk setiap perubahan data penting
- Loading skeleton untuk UX yang lebih baik

---

## Tech Stack

### Frontend

| Komponen | Teknologi |
|----------|-----------|
| Framework | React 19 |
| Bahasa | TypeScript (strict mode) |
| Bundler | Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router DOM 7 |
| State Management | TanStack React Query 5 |
| Form Handling | React Hook Form 7 + Zod 4 |
| Icons | Lucide React |
| Utilities | clsx + tailwind-merge |

### Backend

| Komponen | Teknologi |
|----------|-----------|
| Platform | Supabase |
| Database | PostgreSQL 15 |
| Auth | Supabase Auth (JWT) |
| Security | Row Level Security (RLS) |
| RPC | PostgreSQL Functions (plpgsql) |

### Development Tools

| Komponen | Teknologi |
|----------|-----------|
| Package Manager | pnpm 10 (workspaces) |
| Linting | ESLint 10 |
| Testing | Vitest + Testing Library |
| Database Migrations | Supabase CLI |

---

## Demo / Screenshot

```
[Tambahkan screenshot di sini]
```

---

## Instalasi

### Prasyarat

- **Node.js** 18 atau lebih baru
- **pnpm** 10 atau lebih baru
- **Docker** (untuk Supabase lokal)
- **Supabase CLI**

### Langkah Instalasi

1. **Clone repositori:**

```bash
git clone https://github.com/username/ledjer.git
cd ledjer
```

2. **Instal dependensi:**

```bash
pnpm install
```

3. **Siapkan environment variables:**

```bash
cd apps/web
cp .env.example .env.local
```

4. **Edit `apps/web/.env.local` dengan nilai yang benar** (lihat bagian Environment Variables).

---

## Cara Menjalankan

### Development Mode

```bash
pnpm dev
```

Aplikasi tersedia di `http://localhost:5173`.

### Build Production

```bash
pnpm build
```

### Preview Build

```bash
cd apps/web
pnpm preview
```

---

## Environment Variables

Buat file `apps/web/.env.local` berdasarkan `apps/web/.env.example`:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `VITE_SUPABASE_URL` | URL endpoint Supabase project | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anonymous key dari Supabase | `eyJhbGci...` |

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

## Struktur Folder

```
Ledjer/
├── apps/
│   └── web/                              # Frontend aplikasi
│       └── src/
│           ├── components/
│           │   ├── error-boundary.tsx     # Error boundary
│           │   └── ui/                    # Komponen UI (14+ komponen)
│           ├── contexts/                  # Auth context
│           ├── hooks/                     # Custom hooks
│           ├── layouts/                   # Layout dashboard (sidebar responsive)
│           ├── lib/                       # Utilitas (supabase, formatting, dll)
│           ├── pages/
│           │   ├── dashboard.tsx          # Dashboard utama
│           │   ├── login.tsx              # Halaman login
│           │   ├── register.tsx           # Halaman registrasi
│           │   ├── onboarding.tsx         # Onboarding baru
│           │   ├── accounts/              # Chart of Accounts
│           │   ├── products/              # Manajemen produk
│           │   ├── transactions/          # Pencatatan transaksi
│           │   ├── reports/               # Laporan keuangan
│           │   └── settings/              # Pengaturan & tim
│           └── routes/
├── packages/
│   ├── accounting-core/                   # Logic akuntansi (planned)
│   ├── database-types/                    # TypeScript types dari database
│   └── schemas/                           # Validation schemas
├── supabase/
│   ├── config.toml                        # Konfigurasi Supabase
│   └── migrations/                        # 26 migrasi SQL
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

## Testing

```bash
# Jalankan semua test
pnpm test

# Jalankan test dengan watch mode
pnpm test:watch

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

---

## Deployment

### Frontend (Vercel / Netlify)

1. Push kode ke repository
2. Hubungkan ke Vercel atau Netlify
3. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build command: `pnpm --filter web build`
5. Output directory: `apps/web/dist`

### Database (Supabase Cloud)

```bash
supabase login
supabase link --project-ref your-project-id
supabase db push
```

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

## Alur Transaksi dan Jurnal Akuntansi

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

#### Pembelian Tunai (Dengan Produk)
```
Debit:  Persediaan (1300)          Rp X
Credit: Kas/Bank (1110-1130)       Rp X
```

---

## Sistem Izin

| Peran | Keterangan |
|-------|------------|
| **Owner** | Akses penuh ke seluruh fitur |
| **Staff** | Akses terbatas sesuai pengaturan |

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

## Roadmap

- [ ] Ekspor laporan ke PDF dan Excel
- [ ] Multi-currency support
- [ ] Fitur recurring transactions
- [ ] Pencetakan faktur (invoice)
- [ ] Integrasi dengan payment gateway
- [ ] Mobile responsive optimization
- [ ] Pajak (PPN/PPh) otomatis
- [ ] Reconciliasi bank

---

## Kontribusi

Kontribusi sangat diterima! Silakan buka issue terlebih dahulu untuk mendiskusikan perubahan yang ingin Anda lakukan.

1. Fork repository ini
2. Buat branch baru (`git checkout -b feature/fitur-baru`)
3. Commit perubahan Anda (`git commit -m 'Add fitur baru'`)
4. Push ke branch (`git push origin feature/fitur-baru`)
5. Buka Pull Request

---

## Keamanan

Fitur keamanan yang diimplementasikan:

- **Row Level Security (RLS)** — Isolasi data per organisasi
- **Rate Limiting** — Client-side dan server-side
- **Input Sanitization** — Validasi dan sanitasi input
- **Security Headers** — CSP, X-Frame-Options, dll
- **Audit Logging** — Pelacakan semua perubahan data
- **Login Tracking** — Pencatatan percobaan login

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

[ISC License](LICENSE)

---

## Kontak

Untuk pertanyaan atau masukan, silakan buka [issue](https://github.com/username/ledjer/issues) di repository.

**Author:** [Nama Anda](https://github.com/username)
