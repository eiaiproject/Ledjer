PRAGMA foreign_keys = ON;

-- Transaction attachments (receipts, invoices, documents)
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_id TEXT,
  entity_type TEXT NOT NULL DEFAULT 'transaction' CHECK (entity_type IN ('transaction', 'party', 'product')),
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,  -- key in R2 bucket
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_org_entity ON attachments(organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_transaction ON attachments(transaction_id);

UPDATE app_metadata SET value = '10' WHERE key = 'schema.foundation';
