# Ledjer

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-ISC-green)
![Status](https://img.shields.io/badge/status-development-orange)
![pnpm](https://img.shields.io/badge/pnpm-10-yellow)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E)

> Sistem pembukuan double-entry untuk UMKM Indonesia. Catat transaksi, kelola persediaan, danhasilkan laporan keuangan — tanpa spreadsheet.

<!-- PLACEHOLDER: Screenshot dashboard, transaksi, laporan. Ganti baris di bawah dengan path gambar. -->
<!-- ![Dashboard](docs/screenshots/dashboard.png) -->

---

## TL;DR

Ledjer adalah aplikasi akuntansi web untuk bisnis kecil dan menengah di Indonesia. Menggunakan metode double-entry bookkeeping dengan 14 jenis transaksi, manajemen persediaan weighted-average, dan 4 laporan keuangan standar (General Ledger, Trial Balance, Profit & Loss, Balance Sheet). Dibangun dengan React 19 + Supabase, dijalankan sepenuhnya di browser tanpa install.

---

## Fitur

### Pencatatan Transaksi

14 jenis transaksi yang mencakup seluruh aktivitas keuangan operasional:

| Kategori | Jenis Transaksi |
|----------|-----------------|
| **Kas** | Penjualan Tunai, Pembelian Tunai, Terima Piutang, Bayar Utang, Bayar Beban, Modal Pemilik, Penarikan Tunai, Transfer Antar Rekening |
| **Kredit** | Penjualan Kredit, Pembelian Kredit (lunas / parsial) |
| **Penyesuaian** | Penyesuaian Manual (owner only) |
| **Saldo Awal** | Saldo Awal Kas, Saldo Awal Piutang, Saldo Awal Utang |

Setiap transaksi yang diposting otomatis membuat jurnal akuntansi yang seimbang (debit = credit).

### Manajemen Persediaan

- CRUD produk dengan kode, nama, harga beli, harga jual, stok
- Harga Pokok Penjualan (HPP) menggunakan metode **Weighted Average**
- Riwayat pergerakan stok (stock movements)
- Validasi stok negatif

### Pelaporan Keuangan

| Laporan | Deskripsi |
|---------|-----------|
| General Ledger | Rincian transaksi per akun dengan saldo berjalan |
| Trial Balance | Ringkasan saldo debit dan kredit seluruh akun aktif |
| Profit & Loss | Pendapatan, HPP, beban operasional, pendapatan lain, beban lain |
| Balance Sheet | Aset = Liabilitas + Ekuitas + Laba Tahun Berjalan |

### Sistem Izin

- **Owner**: Akses penuh
- **Staff**: Akses terbatas berdasarkan 6 izin granular

| Izin | Deskripsi |
|------|-----------|
| `can_create_transaction` | Membuat transaksi |
| `can_view_reports` | Melihat laporan keuangan |
| `can_manage_accounts` | Mengelola Chart of Accounts |
| `can_void_transaction` | Membatalkan transaksi |
| `can_manage_products` | Mengelola data produk |
| `can_view_audit_log` | Melihat log audit |

### Fitur Lainnya

- Dashboard dengan ringkasan keuangan
- Multi-tenant (organisasi terpisah)
- Undangan tim melalui email
- Log audit untuk setiap perubahan data
- Format Rupiah Indonesia (IDR)
- Onboarding wizard untuk setup bisnis baru

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| Routing | React Router DOM 7 |
| State | TanStack React Query 5 |
| Forms | React Hook Form 7 + Zod 4 |
| Backend | Supabase (PostgreSQL 15, Auth, RLS) |
| RPC | PostgreSQL Functions (PL/pgSQL) |
| Testing | Vitest + Testing Library |
| Package | pnpm 10 (monorepo workspaces) |

---

## Getting Started

### Prasyarat

- Node.js 18+
- pnpm 10+
- Docker (untuk Supabase lokal)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Instalasi

```bash
git clone https://github.com/eiaiproject/Ledjer.git
cd ledjer
pnpm install
```

### Konfigurasi Environment

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Jalankan

```bash
pnpm dev
```

Buka `http://localhost:5173`.

---

## Project Structure

```
Ledjer/
├── apps/
│   └── web/                          # Frontend React
│       └── src/
│           ├── components/ui/        # 20+ komponen UI
│           ├── contexts/             # Auth context
│           ├── hooks/                # Custom hooks
│           ├── layouts/              # Dashboard layout (sidebar)
│           ├── lib/                  # Utilitas, Supabase client, tipe
│           └── pages/
│               ├── dashboard.tsx
│               ├── transactions/     # List, form, detail
│               ├── accounts/         # Chart of Accounts
│               ├── products/         # Manajemen produk
│               ├── reports/          # General Ledger, Trial Balance, P&L, Balance Sheet
│               └── settings/         # Tim, billing
├── packages/
│   ├── database-types/               # TypeScript types (generated)
│   ├── accounting-core/              # Logic akuntansi (planned)
│   └── schemas/                      # Validation schemas
├── supabase/
│   ├── migrations/                   # 43 migrasi SQL
│   └── tests/                        # SQL regression tests
└── docs/
    ├── accounting-rules.md           # Referensi aturan akuntansi
    ├── production-readiness.md       # Checklist production
    └── qa-checklist.md              # QA scenarios
```

---

## Accounting Rules

### Jurnal per Transaksi

<details>
<summary><strong>Cash Sale</strong> — Penjualan tunai</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Kas/Bank (1110-1130) | Rp X | |
| Pendapatan (4100+) | | Rp X |

Dengan produk → tambah jurnal HPP:
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
| Kas/Bank (1110-1130) | Rp X | |
| Piutang Usaha (1200) | | Rp X |
</details>

<details>
<summary><strong>Cash Purchase</strong> — Pembelian tunai</summary>

Tanpa produk:
| Akun | Debit | Credit |
|------|-------|--------|
| Beban/Persediaan (5100+) | Rp X | |
| Kas/Bank (1110-1130) | | Rp X |

Dengan produk:
| Akun | Debit | Credit |
|------|-------|--------|
| Persediaan (1300) | Rp X | |
| Kas/Bank (1110-1130) | | Rp X |
</details>

<details>
<summary><strong>Credit Purchase</strong> — Pembelian kredit (utang)</summary>

| Status | Debit | Credit |
|--------|-------|--------|
| Unpaid | Persediaan/Beban | Utang Usaha (2100) |
| Partial | Persediaan/Beban | Kas/Bank + Utang Usaha |
</details>

<details>
<summary><strong>Pay Payable</strong> — Bayar utang</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Utang Usaha (2100) | Rp X | |
| Kas/Bank (1110-1130) | | Rp X |
</details>

<details>
<summary><strong>Expense Payment</strong> — Bayar beban operasional</summary>

| Akun | Debit | Credit |
|------|-------|--------|
| Beban (6xxx) | Rp X | |
| Kas/Bank (1110-1130) | | Rp X |
</details>

<details>
<summary><strong>Owner Capital / Draw</strong></summary>

Modal masuk:
| Akun | Debit | Credit |
|------|-------|--------|
| Kas/Bank | Rp X | |
| Modal Pemilik (3100) | | Rp X |

Prive (tarik tunai):
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

Membatalkan transaksi:
1. Buat jurnal reversal (debit ↔ credit dibalik)
2. Status transaksi → `voided`
3. Stok dikembalikan (jika produk)
4. Audit log tercatat
</details>

Dokumentasi lengkap: [`docs/accounting-rules.md`](docs/accounting-rules.md)

---

## Security

| Layer | Implementasi |
|-------|-------------|
| Auth | Supabase Auth (JWT) |
| Data isolation | Row Level Security (RLS) — setiap tabel terisolasi per organisasi |
| RPC | `SECURITY DEFINER` + `search_path = public` |
| Permissions | `has_permission()` checked in every RPC |
| Audit | `audit_logs` tercatat untuk semua aksi finansial |
| Rate limiting | `rate_limits` table + `check_rate_limit()` |
| Login tracking | `login_attempts` table |
| Input sanitization | Client-side + server-side validation |

---

## Testing

```bash
pnpm typecheck    # TypeScript compilation
pnpm lint         # ESLint
pnpm test         # Unit tests (Vitest)
pnpm build        # Production build
```

SQL regression tests:
```bash
supabase db reset
supabase test db
```

---

## Deployment

### Frontend (Vercel / Netlify / Cloudflare Pages)

1. Hubungkan repository
2. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Build command: `pnpm --filter web build`
4. Output: `apps/web/dist`

### Database (Supabase Cloud)

```bash
supabase login
supabase link --project-ref your-project-id
supabase db push
```

---

## Known Limitations

- Tidak ada export laporan (CSV/PDF)
- Tidak ada closing entries otomatis
- Tidak ada multi-currency
- Tidak ada invoice-level AR/AP tracking
- Tidak ada integrasi payment gateway
- Tidak ada pajak (PPN/PPh) otomatis
- Terbatas pada konteks bisnis Indonesia (IDR, Bahasa Indonesia)

## Roadmap

- [ ] Export laporan ke PDF dan Excel
- [ ] Closing entries otomatis
- [ ] Pencetakan faktur (invoice)
- [ ] Rekonsiliasi bank
- [ ] Integrasi payment gateway
- [ ] Pajak (PPN/PPh) otomatis
- [ ] Multi-currency
- [ ] Multi-gudang

---

## Contributing

1. Fork repository
2. Buat branch (`git checkout -b feature/nama-fitur`)
3. Commit (`git commit -m 'Add: deskripsi'`)
4. Push (`git push origin feature/nama-fitur`)
5. Buka Pull Request ke `https://github.com/eiaiproject/Ledjer`

---

## License

[ISC License](LICENSE)

---

<!-- ════════════════════════════════════════════════════════════════ -->
<!-- TODO SEBELUM PRODUCTION:                                       -->
<!-- 1. Screenshot → simpan di docs/screenshots/ lalu uncomment     -->
<!--    baris gambar di bagian atas README                           -->
<!-- ════════════════════════════════════════════════════════════════ -->
