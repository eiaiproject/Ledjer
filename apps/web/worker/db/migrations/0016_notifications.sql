PRAGMA foreign_keys = ON;

-- In-app notifications for P2.7 Notification and Task Center.
-- Supports multiple notification categories, read/unread status,
-- and linking back to the relevant entity.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,        -- who receives this notification
  category TEXT NOT NULL CHECK (category IN (
    'overdue_receivable', 'upcoming_payable', 'low_stock',
    'pending_approval', 'unclosed_period', 'team_invitation',
    'import_failed', 'export_completed', 'backup_failed',
    'role_changed', 'new_device_login', 'recurring_failed',
    'system'
  )),
  title TEXT NOT NULL,                     -- e.g. "Piutang Jatuh Tempo"
  message TEXT NOT NULL,                   -- e.g. "3 faktur menunggu pembayaran"
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  is_read INTEGER NOT NULL DEFAULT 0,
  action_url TEXT,                         -- link to the relevant page
  entity_type TEXT,                        -- e.g. 'transaction', 'invoice', 'product'
  entity_id TEXT,                          -- reference to the entity
  created_by TEXT,                         -- system or user ID who generated it
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_org_recipient ON notifications(organization_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(organization_id, recipient_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

UPDATE app_metadata SET value = '16' WHERE key = 'schema.foundation';
