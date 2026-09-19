-- Reset staging to project minimal seed (hard reset tiap E2E run).
-- Tujuan: DB selalu = state project (16 akun system), tanpa tumpukan E2E.
-- Data staging boleh hilang permanen — hanya untuk tes, bukan produksi.
-- Keep: users, app_metadata, d1_migrations. Hapus: semua data bisnis (is_system=0, produk, transaksi, audit).
-- Pakai defer agar DROP parent (accounts) walau masih direfer child tidak fail di D1 (D1 ignore PRAGMA foreign_keys=OFF).

PRAGMA defer_foreign_keys = TRUE;
PRAGMA foreign_keys = ON;

-- Pastikan tabel sync baru ada (untuk DB lama sebelum 0010, DELETE tidak fail)
CREATE TABLE IF NOT EXISTS parties (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_ops (op_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);

-- 1. Hapus child paling tergantung dulu (urutan penting untuk FK, walau defer tetap child-first lebih aman)
DELETE FROM stock_movements; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM journal_lines; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM sync_ops; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM journal_entries; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM transactions; -- NOSONAR reset staging: wipe tabel bisnis disengaja

-- 2. Hapus produk & akun non-system, serta audit
DELETE FROM products; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM audit_logs; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM accounts WHERE is_system = 0;

-- 3. Hapus entitas sync/offline (baru di 0010, kosongkan tiap run)
DELETE FROM sync_devices; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM sync_ops; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM parties; -- NOSONAR reset staging: wipe tabel bisnis disengaja

-- 4. Hapus rate_limits & sesi kadaluarsa (opsional, hemat rows)
DELETE FROM rate_limits; -- NOSONAR reset staging: wipe tabel bisnis disengaja
DELETE FROM sessions WHERE expires_at < unixepoch('now') * 1000;

-- 5. Vacuum ringan (opsional, kembalikan size)
-- VACUUM; -- di-D1 VACUUM tidak didukung via execute, di-skip

PRAGMA foreign_key_check;
