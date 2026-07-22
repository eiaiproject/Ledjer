-- ponytail: Expand-contract migration to make organization_id nullable.
-- D1 applies migrations atomically (single transaction), so if this fails
-- mid-way the entire migration rolls back — no partial state.
-- Coordination: deploy this migration BEFORE the Worker that expects
-- nullable organization_id. The Worker referencing the old schema uses
-- `audit_logs` (not `audit_logs_v2`), so it will work during the brief
-- window before this file completes.
-- Standard SQLite pattern: CREATE v2 → COPY → DROP v1 → RENAME v2 TO v1.
PRAGMA foreign_keys = OFF;

-- P1-1: Make audit_logs.organization_id nullable so auth-scoped events
-- (login, logout, registration, OAuth) can be logged without an org context.
CREATE TABLE IF NOT EXISTS audit_logs_v2 (
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
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

INSERT INTO audit_logs_v2 SELECT * FROM audit_logs;

DROP TABLE IF EXISTS audit_logs;

ALTER TABLE audit_logs_v2 RENAME TO audit_logs;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(organization_id, entity_type, entity_id);

UPDATE app_metadata SET value = '8' WHERE key = 'schema.foundation';

PRAGMA foreign_keys = ON;
