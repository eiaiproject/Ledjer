PRAGMA foreign_keys = ON;

-- Async export jobs for large data exports.
-- Jobs are created synchronously, processed in chunks by the cron worker,
-- and results are stored in R2 with expiring download links.
CREATE TABLE IF NOT EXISTS export_jobs_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  export_type TEXT NOT NULL,           -- 'transactions', 'general_ledger', 'trial_balance', 'profit_loss', 'balance_sheet', 'accounts', 'products'
  parameters_json TEXT NOT NULL DEFAULT '{}',  -- Filter parameters (date range, account, etc.)
  format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'xlsx')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'expired'
  )),
  progress REAL NOT NULL DEFAULT 0.0,  -- 0.0 to 1.0
  row_count INTEGER NOT NULL DEFAULT 0,
  file_key TEXT,                        -- R2 key for the exported file
  file_url TEXT,                        -- Signed/expiring download URL
  file_expires_at INTEGER,              -- When the URL expires
  file_size_bytes INTEGER,              -- Size of the exported file
  is_truncated INTEGER NOT NULL DEFAULT 0,  -- 1 if data was truncated at MAX_EXPORT_ROWS
  total_available_rows INTEGER,         -- Total rows before truncation
  error_message TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_v2_org ON export_jobs_v2(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_v2_status ON export_jobs_v2(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_v2_expires ON export_jobs_v2(file_expires_at);

-- Cleanup old export jobs (keep last 90 days)
-- Run via scheduled worker or manual maintenance.

UPDATE app_metadata SET value = '24' WHERE key = 'schema.foundation';
