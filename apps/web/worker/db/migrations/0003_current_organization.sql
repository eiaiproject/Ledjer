ALTER TABLE sessions ADD COLUMN current_organization_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_current_organization
  ON sessions(current_organization_id);
