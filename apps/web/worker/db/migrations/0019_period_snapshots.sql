PRAGMA foreign_keys = ON;

-- Store a report snapshot before locking a period.
-- Captures trial balance, P&L, cash balance, and entity counts.
CREATE TABLE IF NOT EXISTS period_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  period_end_date TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_period_snapshots_org_date ON period_snapshots(organization_id, period_end_date);

UPDATE app_metadata SET value = '19' WHERE key = 'schema.foundation';
