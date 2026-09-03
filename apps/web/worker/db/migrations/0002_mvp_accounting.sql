-- Ledjer MVP accounting schema: double-entry journal with 5 cash-based
-- transaction types. Reports (saldo kas/bank, laba rugi, neraca) dibaca dari
-- journal lines yang terkait transaksi berstatus 'posted'.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_class TEXT NOT NULL CHECK (account_class IN ('asset', 'liability', 'equity', 'income', 'expense')),
  account_subtype TEXT CHECK (account_subtype IN ('cash', 'bank') OR account_subtype IS NULL),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_org_code ON accounts(organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_org_name ON accounts(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_accounts_org_class ON accounts(organization_id, account_class);
CREATE INDEX IF NOT EXISTS idx_accounts_org_active ON accounts(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_org_subtype ON accounts(organization_id, account_subtype);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('cash_in', 'cash_out', 'transfer', 'owner_deposit', 'owner_withdrawal')),
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
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY (counter_account_id) REFERENCES accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_number ON transactions(transaction_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_org_idempotency ON transactions(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON transactions(organization_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_org_status ON transactions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_org_type ON transactions(organization_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_org_created ON transactions(organization_id, created_at);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_transaction ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date ON journal_entries(organization_id, entry_date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  journal_entry_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  debit_idr INTEGER NOT NULL DEFAULT 0 CHECK (debit_idr >= 0),
  credit_idr INTEGER NOT NULL DEFAULT 0 CHECK (credit_idr >= 0),
  created_at INTEGER NOT NULL,
  CHECK (
    (debit_idr > 0 AND credit_idr = 0)
    OR (debit_idr = 0 AND credit_idr > 0)
  ),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_account ON journal_lines(organization_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_account_date ON journal_lines(organization_id, account_id, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  request_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(organization_id, entity_type, entity_id);
