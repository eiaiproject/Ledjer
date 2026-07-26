-- Add idempotency_key columns to accounts, products, invoices, and
-- business_documents tables to support idempotent creation
-- (network retry safety).

ALTER TABLE accounts ADD COLUMN idempotency_key TEXT;
ALTER TABLE products ADD COLUMN idempotency_key TEXT;
ALTER TABLE invoices ADD COLUMN idempotency_key TEXT;
ALTER TABLE business_documents ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_org_idempotency ON accounts(organization_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_idempotency ON products(organization_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_idempotency ON invoices(organization_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_documents_org_idempotency ON business_documents(organization_id, idempotency_key);
