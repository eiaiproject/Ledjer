PRAGMA foreign_keys = ON;

-- Dimensional accounting: branches, departments, projects, cost centers, profit centers.
-- This is a lightweight approach: a single dimensions table with a type discriminator,
-- plus a transaction_tags junction table to link journal entries to dimensions.
-- Avoids adding columns to every table while still supporting dimensional reports.
CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dimension_type TEXT NOT NULL CHECK (dimension_type IN (
    'branch', 'department', 'project', 'cost_center', 'profit_center'
  )),
  code TEXT NOT NULL,                  -- Human-readable code, e.g. "BR-001", "DEPT-FIN"
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  parent_id TEXT,                      -- Optional hierarchy (e.g. department under branch)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES dimensions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dimensions_org_code ON dimensions(organization_id, dimension_type, code);
CREATE INDEX IF NOT EXISTS idx_dimensions_org_type ON dimensions(organization_id, dimension_type);
CREATE INDEX IF NOT EXISTS idx_dimensions_parent ON dimensions(parent_id);

-- Links transactions to dimensions. One transaction can have multiple tags.
-- Used for dimensional reports: filter/summarize by dimension.
CREATE TABLE IF NOT EXISTS transaction_tags (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  dimension_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_txn ON transaction_tags(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_dim ON transaction_tags(organization_id, dimension_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_tags_unique ON transaction_tags(transaction_id, dimension_id);

-- Optional: journal_line_level tags for splitting a transaction across dimensions.
CREATE TABLE IF NOT EXISTS journal_line_tags (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  journal_line_id TEXT NOT NULL,
  dimension_id TEXT NOT NULL,
  allocation_percent REAL NOT NULL DEFAULT 100 CHECK (allocation_percent > 0 AND allocation_percent <= 100),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (journal_line_id) REFERENCES journal_lines(id) ON DELETE CASCADE,
  FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_journal_line_tags_line ON journal_line_tags(journal_line_id);
CREATE INDEX IF NOT EXISTS idx_journal_line_tags_dim ON journal_line_tags(organization_id, dimension_id);

UPDATE app_metadata SET value = '22' WHERE key = 'schema.foundation';
