PRAGMA foreign_keys = ON;

-- Payment allocations: links a payment transaction to one or more invoices
CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  transaction_id TEXT,               -- the payment transaction (NULL for manual adjustment)
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  allocation_date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_transaction ON payment_allocations(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_org ON payment_allocations(organization_id);

UPDATE app_metadata SET value = '13' WHERE key = 'schema.foundation';
