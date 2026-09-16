-- Migration: 0009_single_user.sql
-- Fase 1 (de-multi-tenant): Ledjer menjadi aplikasi single-user — satu akun =
-- satu buku.
--
-- Yang berubah:
--   1. users.business_name menggantikan organizations.name (label "nama usaha").
--   2. Setiap tabel tenant di-skoping ke user_id, bukan organization_id.
--      Pemilik organization (membership paling awal) menjadi pemilik baris.
--   3. Tabel organizations & memberships dibuang, termasuk
--      sessions.current_organization_id.
--
-- Forward-only (ADR 0002): migrasi 0001-0008 tidak disentuh. Pola rebuild
-- tabel (create _v2 → INSERT SELECT → DROP → RENAME) sama seperti 0007.
--
-- Fail-closed: kolom user_id NOT NULL, jadi baris yatim (organization tanpa
-- membership) menggagalkan migrasi alih-alih menghasilkan baris tanpa pemilik.
-- Ini tidak terjadi pada data nyata karena createOrganizationWithOwner menulis
-- organization + membership dalam satu batch.

PRAGMA foreign_keys = OFF;

-- 1. users.business_name menggantikan organizations.name.
ALTER TABLE users ADD COLUMN business_name TEXT NOT NULL DEFAULT '';

UPDATE users SET business_name = COALESCE((
  SELECT o.name
  FROM memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = users.id
  ORDER BY m.created_at ASC
  LIMIT 1
), '');

-- 2. accounts
CREATE TABLE IF NOT EXISTS accounts_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_class TEXT NOT NULL CHECK (account_class IN ('asset', 'liability', 'equity', 'income', 'expense')),
  account_subtype TEXT CHECK (account_subtype IN ('cash', 'bank') OR account_subtype IS NULL),
  account_kind TEXT CHECK (account_kind IN ('inventory', 'cogs') OR account_kind IS NULL),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO accounts_v2 (
  id, user_id, code, name, account_class, account_subtype, account_kind,
  is_system, is_active, created_at, updated_at
)
SELECT
  id,
  (SELECT m.user_id FROM memberships m WHERE m.organization_id = accounts.organization_id ORDER BY m.created_at ASC LIMIT 1),
  code, name, account_class, account_subtype, account_kind,
  is_system, is_active, created_at, updated_at
FROM accounts;

DROP TABLE IF EXISTS accounts;

ALTER TABLE accounts_v2 RENAME TO accounts;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_code ON accounts(user_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_name ON accounts(user_id, name);
CREATE INDEX IF NOT EXISTS idx_accounts_user_class ON accounts(user_id, account_class);
CREATE INDEX IF NOT EXISTS idx_accounts_user_active ON accounts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_user_subtype ON accounts(user_id, account_subtype);

-- 3. transactions (created_by menjadi user_id)
CREATE TABLE IF NOT EXISTS transactions_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('cash_in', 'cash_out', 'transfer', 'owner_deposit', 'owner_withdrawal', 'purchase')),
  transaction_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  cash_account_id TEXT,
  counter_account_id TEXT,
  idempotency_key TEXT,
  idempotency_payload_hash TEXT,
  voided_at INTEGER,
  void_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY (counter_account_id) REFERENCES accounts(id)
);

INSERT INTO transactions_v2 (
  id, user_id, transaction_number, transaction_type, transaction_date,
  description, status, amount_idr, cash_account_id, counter_account_id,
  idempotency_key, idempotency_payload_hash, voided_at, void_reason,
  created_at, updated_at
)
SELECT
  id, created_by, transaction_number, transaction_type, transaction_date,
  description, status, amount_idr, cash_account_id, counter_account_id,
  idempotency_key, idempotency_payload_hash, voided_at, void_reason,
  created_at, updated_at
FROM transactions;

DROP TABLE IF EXISTS transactions;

ALTER TABLE transactions_v2 RENAME TO transactions;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_number ON transactions(user_id, transaction_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_idempotency ON transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at);

-- 4. journal_entries
CREATE TABLE IF NOT EXISTS journal_entries_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

INSERT INTO journal_entries_v2 (id, user_id, transaction_id, entry_date, description, created_at)
SELECT
  id,
  (SELECT m.user_id FROM memberships m WHERE m.organization_id = journal_entries.organization_id ORDER BY m.created_at ASC LIMIT 1),
  transaction_id, entry_date, description, created_at
FROM journal_entries;

DROP TABLE IF EXISTS journal_entries;

ALTER TABLE journal_entries_v2 RENAME TO journal_entries;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_transaction ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date ON journal_entries(user_id, entry_date);

-- 5. journal_lines
CREATE TABLE IF NOT EXISTS journal_lines_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  journal_entry_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  debit_idr INTEGER NOT NULL DEFAULT 0 CHECK (debit_idr >= 0),
  credit_idr INTEGER NOT NULL DEFAULT 0 CHECK (credit_idr >= 0),
  created_at INTEGER NOT NULL,
  CHECK (
    (debit_idr > 0 AND credit_idr = 0)
    OR (debit_idr = 0 AND credit_idr > 0)
  ),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

INSERT INTO journal_lines_v2 (id, user_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at)
SELECT
  id,
  (SELECT m.user_id FROM memberships m WHERE m.organization_id = journal_lines.organization_id ORDER BY m.created_at ASC LIMIT 1),
  journal_entry_id, account_id, debit_idr, credit_idr, created_at
FROM journal_lines;

DROP TABLE IF EXISTS journal_lines;

ALTER TABLE journal_lines_v2 RENAME TO journal_lines;

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_user_account ON journal_lines(user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_user_account_date ON journal_lines(user_id, account_id, created_at);

-- 6. audit_logs (user_id menyerap organization_id)
CREATE TABLE IF NOT EXISTS audit_logs_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  request_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO audit_logs_v2 (
  id, user_id, actor_user_id, entity_type, entity_id, action,
  before_json, after_json, reason, request_id, created_at
)
SELECT
  id,
  COALESCE(
    actor_user_id,
    (SELECT m.user_id FROM memberships m WHERE m.organization_id = audit_logs.organization_id ORDER BY m.created_at ASC LIMIT 1)
  ),
  actor_user_id, entity_type, entity_id, action,
  before_json, after_json, reason, request_id, created_at
FROM audit_logs;

DROP TABLE IF EXISTS audit_logs;

ALTER TABLE audit_logs_v2 RENAME TO audit_logs;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(user_id, entity_type, entity_id);

-- 7. products
CREATE TABLE IF NOT EXISTS products_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  selling_price_idr INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_idr >= 0),
  current_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (current_stock_milli >= 0),
  average_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (average_cost_minor >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO products_v2 (
  id, user_id, code, name, unit, selling_price_idr, current_stock_milli,
  average_cost_minor, is_active, created_at, updated_at
)
SELECT
  id,
  (SELECT m.user_id FROM memberships m WHERE m.organization_id = products.organization_id ORDER BY m.created_at ASC LIMIT 1),
  code, name, unit, selling_price_idr, current_stock_milli,
  average_cost_minor, is_active, created_at, updated_at
FROM products;

DROP TABLE IF EXISTS products;

ALTER TABLE products_v2 RENAME TO products;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_code ON products(user_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_name ON products(user_id, name);
CREATE INDEX IF NOT EXISTS idx_products_user_active ON products(user_id, is_active);

-- 8. stock_movements
CREATE TABLE IF NOT EXISTS stock_movements_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli != 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  cost_total_idr INTEGER NOT NULL CHECK (cost_total_idr >= 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO stock_movements_v2 (
  id, user_id, transaction_id, product_id, quantity_milli, unit_cost_minor,
  cost_total_idr, created_at
)
SELECT
  id,
  (SELECT m.user_id FROM memberships m WHERE m.organization_id = stock_movements.organization_id ORDER BY m.created_at ASC LIMIT 1),
  transaction_id, product_id, quantity_milli, unit_cost_minor,
  cost_total_idr, created_at
FROM stock_movements;

DROP TABLE IF EXISTS stock_movements;

ALTER TABLE stock_movements_v2 RENAME TO stock_movements;

CREATE INDEX IF NOT EXISTS idx_stock_movements_transaction ON stock_movements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(user_id, product_id, created_at);

-- 9. sessions: buang organization aktif
-- current_organization_id adalah satu-satunya FK sessions → organizations, jadi
-- harus hilang sebelum organizations di-drop (kalau tidak, foreign_key_check
-- melaporkan foreign key mismatch). Rebuild dipakai, bukan ALTER TABLE DROP
-- COLUMN, karena SQLite menolak drop kolom yang masih muncul di definisi FK.
CREATE TABLE IF NOT EXISTS sessions_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  last_rotated_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  previous_token_hash TEXT,
  previous_token_expires_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO sessions_v2 (
  id, user_id, token_hash, ip_address, user_agent, expires_at,
  last_used_at, last_rotated_at, revoked_at, created_at,
  previous_token_hash, previous_token_expires_at
)
SELECT
  id, user_id, token_hash, ip_address, user_agent, expires_at,
  last_used_at, last_rotated_at, revoked_at, created_at,
  previous_token_hash, previous_token_expires_at
FROM sessions;

DROP TABLE IF EXISTS sessions;

ALTER TABLE sessions_v2 RENAME TO sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 10. Buang tabel multi-tenant
DROP TABLE IF EXISTS memberships;

DROP TABLE IF EXISTS organizations;

PRAGMA foreign_keys = ON;

PRAGMA foreign_key_check;
