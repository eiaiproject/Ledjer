PRAGMA foreign_keys = ON;

-- Approval configuration: per-organization thresholds for when an approval is required.
-- Each organization can have at most one config per action type.
CREATE TABLE IF NOT EXISTS approval_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'transaction_create', 'transaction_void',
    'period_reopen', 'stock_adjustment', 'manual_journal'
  )),
  threshold_minor INTEGER NOT NULL DEFAULT 0,    -- 0 = no threshold (always approve)
  enabled INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_configs_org_action ON approval_configs(organization_id, action_type);

-- Individual approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'transaction_create', 'transaction_void',
    'period_reopen', 'stock_adjustment', 'manual_journal'
  )),
  entity_type TEXT NOT NULL,                      -- e.g. 'transaction', 'period_lock'
  entity_id TEXT NOT NULL,                        -- the specific entity being acted on
  entity_summary TEXT,                            -- human-readable description of the entity
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  approved_at INTEGER,
  rejection_reason TEXT,
  decision_note TEXT,                             -- approver's comment
  amount_minor INTEGER NOT NULL DEFAULT 0,        -- the monetary value triggering the approval
  metadata TEXT,                                  -- JSON blob for action-specific context
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status ON approval_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_org_entity ON approval_requests(organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending ON approval_requests(organization_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requester ON approval_requests(requested_by);

UPDATE app_metadata SET value = '17' WHERE key = 'schema.foundation';
