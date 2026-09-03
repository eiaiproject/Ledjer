# Fresh-Start Reset Runbook (Prod D1 → MVP Schema)

**Status:** 🧪 Tervalidasi di **staging** (2026-09-03) — belum dieksekusi di production.
**Dampak:** ⚠️ Menghapus SELURUH data produksi yang ada. Hanya jalankan setelah keputusan eksplisit
"start fresh" dan backup diverifikasi.

## Konteks

- DB produksi (`ledjer-production`) masih memakai **skema legacy pre-MVP** (33 migrasi lama, ~40+ tabel:
  invoices, products, stock, bank statements, dsb.) dan berisi data lama (saat audit: 13 user, 12 org,
  92 transaksi, 342 journal lines, 9 akun Google tertaut).
- MVP memakai skema baru (12 tabel) dari migrasi `0001_mvp_foundation.sql`, `0002_mvp_accounting.sql`,
  `0003_oauth_accounts.sql`.
- Migrasi MVP murni aditif (`CREATE ... IF NOT EXISTS`) — **tidak akan** menyesuaikan/menghapus tabel
  legacy yang sudah ada. Karena itu deploy MVP di atas DB legacy menghasilkan skema campuran yang tidak
  kompatibel dengan kode MVP. **Start fresh = reset DB dulu, baru apply migrasi MVP.**

## Prasyarat

1. Keputusan bisnis: data lama **tidak** dibawa (start fresh).
2. Backup produksi dibuat & diverifikasi bisa di-restore (lihat `scripts/backup-d1.sh`).
3. Merge MVP sudah masuk `main` (atau migrasi sudah tersedia di branch yang akan di-deploy).

## Prosedur (urutan penting)

> Semua perintah dijalankan dari `apps/web`. Prod = **tidak** pakai `--env=staging`.

### 1. Backup produksi (WAJIB — jaring pengaman)

```bash
bash scripts/backup-d1.sh          # → backup-ledjer-<timestamp>.sql (dari ledjer-production)
# Verifikasi file terbentuk & berisi DDL+DATA, simpan salinan di luar repo.
```

Opsional backup kedua via export manual:

```bash
cd apps/web
pnpm exec wrangler d1 export ledjer-production --remote --output=/tmp/ledjer-prod-backup-$(date +%Y%m%d-%H%M%S).sql
```

### 2. Drop seluruh tabel produksi

Tulis file reset (daftar lengkap tabel legacy + MVP; contoh lengkap lihat riwayat reset staging):

```sql
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS oauth_accounts;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS app_metadata;
DROP TABLE IF EXISTS d1_migrations;
-- + SEMUA tabel legacy lain yang masih ada (listing: SELECT name FROM sqlite_master WHERE type='table')
```

Eksekusi:

```bash
cd apps/web
pnpm exec wrangler d1 execute ledjer-production --remote --file=/tmp/ledjer-prod-reset.sql
```

Verifikasi kosong: `num_tables: 0` pada output, atau

```bash
pnpm exec wrangler d1 execute ledjer-production --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

### 3. Apply migrasi MVP fresh

```bash
cd apps/web
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.jsonc
# Harusnya: 0001_mvp_foundation ✅ 0002_mvp_accounting ✅ 0003_oauth_accounts ✅
```

### 4. Verifikasi skema persis MVP + kosong

```bash
pnpm exec wrangler d1 execute ledjer-production --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations','_cf_KV') ORDER BY name"

pnpm exec wrangler d1 execute ledjer-production --remote --command \
  "SELECT (SELECT COUNT(*) FROM users) u,(SELECT COUNT(*) FROM organizations) o,(SELECT COUNT(*) FROM accounts) a,(SELECT COUNT(*) FROM transactions) t"
```

**Harapan:** hanya 12 tabel MVP (`accounts app_metadata audit_logs journal_entries journal_lines
memberships oauth_accounts organizations rate_limits sessions transactions users`) dan semua hitungan = 0.

```bash
pnpm exec wrangler d1 migrations list DB --remote --config wrangler.jsonc   # → "No migrations to apply!"
```

### 5. Deploy MVP + smoke test

- Deploy berjalan otomatis via `.github/workflows/auto-deploy.yml` saat push ke `main`
  (quality → migrations → deploy). Jika reset dilakukan manual lebih dulu, deploy akan aman.
- Verifikasi post-deploy: `/api/health` 200, register user baru → org + COA terbentuk (14 akun),
  login berhasil.

### 6. Rollback (jika ada masalah)

- Worker: `wrangler rollback` (ke versi terakhir).
- DB: restore dari backup langkah 1 via `scripts/restore-d1.sh` (mengembalikan skema legacy + data lama).

## Yang sudah tervalidasi di staging (2026-09-03)

| Langkah | Hasil staging |
|---|---|
| Backup export | ✅ 384 KB (`/tmp/ledjer-staging-backup-*.sql`) |
| Drop semua tabel | ✅ `num_tables: 0` |
| Apply migrasi MVP fresh | ✅ 0001–0003, `No migrations to apply` |
| Verifikasi skema | ✅ 12 tabel MVP, semua hitungan 0 |
| Register user baru (API) | ✅ 200 → 1 user, 1 org, 14 akun COA |
| Full E2E CRUD suite | ✅ **84/84 passed** (~1.7 mnt) |
