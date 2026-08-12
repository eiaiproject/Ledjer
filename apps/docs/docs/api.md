# Referensi API

Ledjer menyediakan API REST di balik aplikasi web — berguna jika Anda ingin mengintegrasikan data pembukuan dengan sistem lain.

## Dasar

- **Base URL produksi**: `https://ledjer.id/api`
- **Format**: JSON (`Content-Type: application/json`)
- **Autentikasi**: session cookie (`__Host-ledjer_session`) — sama dengan login aplikasi
- **CSRF**: permintaan yang mengubah data (POST/PATCH/DELETE) harus berasal dari origin yang diizinkan

## Spesifikasi lengkap

Definisi lengkap endpoint tersedia sebagai **OpenAPI** di repositori:

<https://github.com/eiaiproject/Ledjer/blob/main/docs/api/openapi.yaml>

## Ringkasan endpoint

| Area | Endpoint | Fungsi |
|------|----------|--------|
| **Auth** | `POST /auth/login`, `POST /auth/register` | Masuk & daftar |
| **Organisasi** | `GET /organizations/current` | Organisasi aktif |
| **Transaksi** | `GET/POST /transactions`, `POST /transactions/:id/void` | Catat, daftar, batalkan |
| **Akun** | `GET/POST /accounts` | Chart of accounts |
| **Produk** | `GET/POST /products` | Produk & harga |
| **Faktur** | `GET/POST /invoices`, `POST /invoices/:id/credit-note` | Faktur & nota kredit |
| **Laporan** | `GET /reports/trial-balance`, `/reports/profit-loss`, `/reports/balance-sheet`, `/reports/cash-flow`, `/reports/general-ledger` | Laporan keuangan |
| **Tim** | `GET /team/members`, `POST /team/invitations` | Anggota & undangan |
| **Ekspor** | `GET /exports` | Ekspor CSV |

## Contoh: buat transaksi penjualan tunai

```bash
curl -X POST https://ledjer.id/api/transactions \
  -H "Content-Type: application/json" \
  -b "cookies.txt" \
  -d '{
    "transactionType": "cash_sale",
    "transactionDate": "2026-08-12",
    "amount": 150000,
    "description": "Penjualan tunai",
    "cashAccountId": "<id-akun-kas>",
    "idempotencyKey": "uuid-anda"
  }'
```

> Setiap permintaan yang mengubah data membutuhkan **idempotency key** agar pengiriman ulang (retry) tidak membuat transaksi ganda.

## Versi & perubahan

Kebijakan versioning dan changelog API dijelaskan di `docs/api/versioning.md` pada repositori. Endpoint baru bersifat *additive*; perubahan yang memutus kompatibilitas diumumkan sebelumnya.
