-- Migration: 0010_sync_offline.sql
-- Fase 5 (sync tipis + offline): server penunjang kuat tapi tipis.
-- Menambah tabel yang dibutuhkan sync offline-first:
-- - parties (pelanggan/supplier, dibutuhkan parser "ke/dari si B")
-- - sync_devices (sesi perangkat untuk offline, token_hash)
-- - sync_ops (op-log append-only untuk sync antar-perangkat, dedup op_id, HLC)

PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = TRUE;

-- 1. parties — pelanggan/supplier (baru, dibutuhkan chat "ke/dari")
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  party_type TEXT NOT NULL DEFAULT 'both' CHECK (party_type IN ('customer', 'supplier', 'both')),
  contact TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parties_user_name ON parties(user_id, name);
CREATE INDEX IF NOT EXISTS idx_parties_user_active ON parties(user_id, is_active);

-- 2. sync_devices — sesi perangkat untuk offline (authenticate once, then offline)
CREATE TABLE IF NOT EXISTS sync_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  device_name TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_devices_user ON sync_devices(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_devices_token_hash ON sync_devices(token_hash);
CREATE INDEX IF NOT EXISTS idx_sync_devices_last_seen ON sync_devices(last_seen);

-- 3. sync_ops — op-log append-only untuk sync (dedup op_id, LWW by HLC)
CREATE TABLE IF NOT EXISTS sync_ops (
  op_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('create', 'update', 'delete')),
  payload TEXT NOT NULL,
  hlc TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES sync_devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_ops_user_hlc ON sync_ops(user_id, hlc);
CREATE INDEX IF NOT EXISTS idx_sync_ops_user_entity ON sync_ops(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_ops_created ON sync_ops(created_at);

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
