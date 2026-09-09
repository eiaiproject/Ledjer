-- Migration: 0007_purchase_transaction_type.sql
-- Migrasi 0006 memperkenalkan tipe transaksi `purchase`, tetapi CHECK
-- constraint transaction_type di tabel `transactions` (dibuat di 0002)
-- hanya mengizinkan 5 tipe cash-based lama. SQLite tidak mendukung
-- mengubah constraint via ALTER TABLE, jadi tabel di-recreate dengan
-- definisi identik (0002 + kolom idempotency_payload_hash dari 0004)
-- plus 'purchase' pada CHECK constraint.
--
-- Forward-only: aman untuk organisasi yang sudah punya transaksi karena
-- hanya menyalin data dan membuat ulang indeks yang sama.

PRAGMA foreign_keys = OFF;

CREATE TABLE transactions_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('cash_in', 'cash_out', 'transfer', 'owner_deposit', 'owner_withdrawal', 'purchase')),
  transaction_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  cash_account_id TEXT,
  counter_account_id TEXT,
  idempotency_key TEXT,
  created_by TEXT NOT NULL,
  voided_at INTEGER,
  void_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  idempotency_payload_hash TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY (counter_account_id) REFERENCES accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO transactions_v2 (
  id, organization_id, transaction_number, transaction_type, transaction_date,
  description, status, amount_idr, cash_account_id, counter_account_id,
  idempotency_key, created_by, voided_at, void_reason, created_at, updated_at,
  idempotency_payload_hash
)
SELECT
  id, organization_id, transaction_number, transaction_type, transaction_date,
  description, status, amount_idr, cash_account_id, counter_account_id,
  idempotency_key, created_by, voided_at, void_reason, created_at, updated_at,
  idempotency_payload_hash
FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_v2 RENAME TO transactions;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_number ON transactions(transaction_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_org_idempotency ON transactions(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON transactions(organization_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_org_status ON transactions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_org_type ON transactions(organization_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_org_created ON transactions(organization_id, created_at);

PRAGMA foreign_keys = ON;

PRAGMA foreign_key_check;
