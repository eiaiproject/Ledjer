PRAGMA foreign_keys = ON;

-- Business documents: shared table for quotation, purchase_order,
-- delivery_note, payment_receipt, cash_receipt, cash_payment_voucher, return_note.
-- Invoices use their own table (0012_invoices.sql) for backward compatibility.
CREATE TABLE IF NOT EXISTS business_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'quotation', 'purchase_order', 'delivery_note',
    'payment_receipt', 'cash_receipt', 'cash_payment_voucher', 'return_note'
  )),
  document_number TEXT NOT NULL,
  document_date TEXT NOT NULL,
  party_id TEXT,                              -- customer or supplier
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'confirmed', 'issued', 'sent', 'partially_received',
    'received', 'cancelled', 'converted'
  )),
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  notes TEXT,
  terms TEXT,
  -- Reference to related document (e.g. PO → invoice, quotation → invoice)
  reference_document_type TEXT,
  reference_document_id TEXT,
  -- Delivery tracking for purchase_order / delivery_note
  delivery_date TEXT,
  received_by TEXT,
  -- Payment tracking for payment_receipt / cash_receipt / cash_payment_voucher
  payment_method TEXT,
  payment_reference TEXT,
  -- Void info
  void_reason TEXT,
  voided_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bizdocs_org_number ON business_documents(organization_id, document_number);
CREATE INDEX IF NOT EXISTS idx_bizdocs_org_type ON business_documents(organization_id, document_type);
CREATE INDEX IF NOT EXISTS idx_bizdocs_org_party ON business_documents(organization_id, party_id);
CREATE INDEX IF NOT EXISTS idx_bizdocs_org_status ON business_documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_bizdocs_org_date ON business_documents(organization_id, document_date);
CREATE INDEX IF NOT EXISTS idx_bizdocs_ref ON business_documents(reference_document_id);

-- Shared line items for all business document types
CREATE TABLE IF NOT EXISTS document_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  product_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER NOT NULL DEFAULT 1000,
  unit_price_minor INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  line_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES business_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_lines_document ON document_lines(document_id);

UPDATE app_metadata SET value = '14' WHERE key = 'schema.foundation';
