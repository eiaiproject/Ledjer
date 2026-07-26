PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  party_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'voided', 'credited')),
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  notes TEXT,
  terms TEXT,
  credited_by_invoice_id TEXT,
  void_reason TEXT,
  created_by TEXT NOT NULL,
  issued_at INTEGER,
  paid_at INTEGER,
  voided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (credited_by_invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_number ON invoices(organization_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_org_party ON invoices(organization_id, party_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_date ON invoices(organization_id, invoice_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  product_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit_price_minor INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  line_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

UPDATE app_metadata SET value = '12' WHERE key = 'schema.foundation';
