/**
 * Local-first SQLite schema — sumber kebenaran di perangkat.
 *
 * Skema ini mengikuti Bagian 07 dokumen perencanaan:
 * - Tidak ada tabel journal_entries/journal_lines (journal diturunkan dari
 *   tipe transaksi + rule_version, bukan disimpan).
 * - Tidak ada tabel organizations/memberships (satu akun = satu buku).
 * - Tabel sync_outbox untuk perubahan yang belum terkirim ke server.
 *
 * Server schema tetap mempertahankan journal_entries/lines untuk
 * backward compatibility; local-first tidak membutuhkannya.
 */

export const LOCAL_SCHEMA_SQL = `
-- =====================================================================
-- Local-first schema (SQLite-WASM / OPFS)
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_class TEXT NOT NULL CHECK (account_class IN ('asset', 'liability', 'equity', 'income', 'expense')),
  account_subtype TEXT,
  account_kind TEXT,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_accounts_user_code ON accounts(user_id, code);
CREATE INDEX IF NOT EXISTS idx_local_accounts_user_active ON accounts(user_id, is_active);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  selling_price_idr INTEGER NOT NULL DEFAULT 0,
  current_stock_milli INTEGER NOT NULL DEFAULT 0,
  average_cost_minor INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_products_user_code ON products(user_id, code);

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

CREATE INDEX IF NOT EXISTS idx_local_parties_user_name ON parties(user_id, name);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  party_id TEXT,
  product_id TEXT,
  cash_account_id TEXT NOT NULL,
  counter_account_id TEXT,
  amount_idr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  void_of_id TEXT,
  rule_version INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT,
  idempotency_payload_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY (counter_account_id) REFERENCES accounts(id),
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_tx_user_op ON transactions(user_id, op_id);
CREATE INDEX IF NOT EXISTS idx_local_tx_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_local_tx_user_status ON transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_local_tx_user_type ON transactions(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_local_tx_user_idempotency ON transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'loss')),
  quantity_milli INTEGER NOT NULL,
  unit_cost_minor INTEGER NOT NULL,
  total_value_minor INTEGER NOT NULL,
  stock_after_milli INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_local_sm_tx ON stock_movements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_local_sm_product ON stock_movements(product_id);

CREATE TABLE IF NOT EXISTS ledger_settings (
  user_id TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL DEFAULT 'IDR',
  rule_version INTEGER NOT NULL DEFAULT 1,
  default_cash_account_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('create', 'update', 'delete')),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  synced_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_outbox_user ON sync_outbox(user_id, synced_at);
`;

/** Apply the full local schema to a SQLite database. */
export function applyLocalSchema(db: { exec(sql: string): void }): void {
  const statements = LOCAL_SCHEMA_SQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    try {
      db.exec(stmt + ";");
    } catch {
      // Indexes may already exist from a previous init — benign.
    }
  }
}
