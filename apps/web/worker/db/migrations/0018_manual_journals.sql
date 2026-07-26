PRAGMA foreign_keys = ON;

-- Extend entry_type CHECK constraint to include 'closing' and 'manual_journal'.
-- SQLite requires a new table + copy for CHECK constraint changes.
-- Step 1: Create the new table with the extended CHECK constraint.
CREATE TABLE IF NOT EXISTS journal_entries_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entry_number TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'normal' CHECK (entry_type IN (
    'normal', 'opening_balance', 'adjustment', 'reversal', 'closing', 'manual_journal'
  )),  -- NOSONAR plsql:S1192 -- can't use constants in SQL CHECK constraint
  transaction_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided', 'reversed')),
  reversed_entry_id TEXT,
  reversal_reason TEXT,
  posted_at INTEGER,
  posted_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (reversed_entry_id) REFERENCES journal_entries(id),
  FOREIGN KEY (posted_by) REFERENCES users(id)
);

-- Step 2: Copy data from old table.
INSERT OR IGNORE INTO journal_entries_v2 (
  id, organization_id, entry_number, entry_date, entry_type,
  transaction_id, description, status, reversed_entry_id, reversal_reason,
  posted_at, posted_by, created_at
)
SELECT
  id, organization_id, entry_number, entry_date, entry_type,
  transaction_id, description, status, reversed_entry_id, reversal_reason,
  posted_at, posted_by, created_at
FROM journal_entries;

-- Step 3: Drop old table and rename.
DROP TABLE IF EXISTS journal_entries;
ALTER TABLE journal_entries_v2 RENAME TO journal_entries;

-- Step 4: Recreate indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_org_number ON journal_entries(organization_id, entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date ON journal_entries(organization_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction ON journal_entries(transaction_id);

-- Journal templates for reusable manual journal entries.
-- Users can save common journal entries (e.g., monthly depreciation) as templates.
CREATE TABLE IF NOT EXISTS journal_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  entry_type TEXT NOT NULL DEFAULT 'manual_journal' CHECK (entry_type IN (
    'manual_journal', 'adjustment', 'closing'
  )),
  lines_json TEXT NOT NULL DEFAULT '[]',      -- JSON array of {account_id, debit_minor, credit_minor, description}
  total_debit_minor INTEGER NOT NULL DEFAULT 0,
  total_credit_minor INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_journal_templates_org ON journal_templates(organization_id);

UPDATE app_metadata SET value = '18' WHERE key = 'schema.foundation';
