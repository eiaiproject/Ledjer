-- Migration: 0011_stock_loss_type.sql
-- Menambah tipe transaksi `stock_loss` (susut stok) ke CHECK constraint
-- transaction_type. SQLite tidak mendukung mengubah constraint via ALTER
-- TABLE, jadi tabel di-recreate dengan definisi identik (0009) plus
-- 'stock_loss' pada CHECK. Pola yang sama dipakai 0007 untuk 'purchase'.
--
-- Susut = penurunan stok non-tunai: jurnal Beban Susut DR / Persediaan CR
-- dan movement stok negatif. Kas tidak tersentuh, jadi transaksi ini tidak
-- dihitung uang keluar di dashboard (cashFlowByType berbasis transaction_type).
--
-- Forward-only: hanya menyalin data dan membuat ulang indeks yang sama.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS transactions_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('cash_in', 'cash_out', 'transfer', 'owner_deposit', 'owner_withdrawal', 'purchase', 'stock_loss')),
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
  id, user_id, transaction_number, transaction_type, transaction_date,
  description, status, amount_idr, cash_account_id, counter_account_id,
  idempotency_key, idempotency_payload_hash, voided_at, void_reason,
  created_at, updated_at
FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_v2 RENAME TO transactions;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_number ON transactions(user_id, transaction_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_idempotency ON transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at);

PRAGMA foreign_keys = ON;

PRAGMA foreign_key_check;
