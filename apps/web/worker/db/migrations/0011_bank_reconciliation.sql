PRAGMA foreign_keys = ON;

-- Imported bank statements (one statement = one file upload)
CREATE TABLE IF NOT EXISTS bank_statements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,          -- cash/bank account being reconciled
  statement_date TEXT NOT NULL,       -- statement date (usually end of period)
  opening_balance INTEGER NOT NULL,
  closing_balance INTEGER NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reconciled')),
  imported_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (imported_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_org_account ON bank_statements(organization_id, account_id);

-- Individual statement lines from bank CSV
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  statement_id TEXT NOT NULL,
  line_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount_minor INTEGER NOT NULL,     -- positive = inflow, negative = outflow
  balance_after_minor INTEGER,
  reference TEXT,
  line_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (statement_id) REFERENCES bank_statements(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_statement ON bank_statement_lines(statement_id);

-- Matching between book transactions and bank statement lines
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  statement_id TEXT NOT NULL,
  statement_line_id TEXT NOT NULL,
  transaction_id TEXT,               -- NULL = unmatched bank item
  journal_line_id TEXT,              -- NULL = unmatched bank item
  match_type TEXT NOT NULL DEFAULT 'auto' CHECK (match_type IN ('auto', 'manual')),
  status TEXT NOT NULL DEFAULT 'matched' CHECK (status IN ('matched', 'unmatched')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (statement_id) REFERENCES bank_statements(id) ON DELETE CASCADE,
  FOREIGN KEY (statement_line_id) REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_matches_line ON reconciliation_matches(statement_line_id);

UPDATE app_metadata SET value = '11' WHERE key = 'schema.foundation';
