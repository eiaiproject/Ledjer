PRAGMA foreign_keys = OFF;

-- Allow fractional unit costs (e.g. 495000 / 251 = 1971.31 per unit)
-- SQLite INTEGER columns coerce floats, REAL keeps them exact (no semicolon in comments)
-- Rewritten tables: products, stock_movements, transaction_lines
-- (Invoice/document line prices stay INTEGER: display rounding only)

CREATE TABLE products_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_price_minor REAL NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  selling_price_minor REAL NOT NULL DEFAULT 0 CHECK (selling_price_minor >= 0),
  average_cost_minor REAL NOT NULL DEFAULT 0 CHECK (average_cost_minor >= 0),
  current_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (current_stock_milli >= 0),
  min_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_milli >= 0),
  inventory_account_id TEXT,
  cogs_account_id TEXT,
  revenue_account_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  idempotency_key TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_account_id) REFERENCES accounts(id),
  FOREIGN KEY (cogs_account_id) REFERENCES accounts(id),
  FOREIGN KEY (revenue_account_id) REFERENCES accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO products_v2 (
  id, organization_id, code, name, description, unit,
  purchase_price_minor, selling_price_minor, average_cost_minor,
  current_stock_milli, min_stock_milli,
  inventory_account_id, cogs_account_id, revenue_account_id,
  is_active, created_by, created_at, updated_at, idempotency_key
)
SELECT
  id, organization_id, code, name, description, unit,
  purchase_price_minor, selling_price_minor, average_cost_minor,
  current_stock_milli, min_stock_milli,
  inventory_account_id, cogs_account_id, revenue_account_id,
  is_active, created_by, created_at, updated_at, idempotency_key
FROM products;

DROP TABLE products;
ALTER TABLE products_v2 RENAME TO products;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_code ON products(organization_id, code);
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org_active ON products(organization_id, is_active);

CREATE TABLE stock_movements_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening', 'purchase', 'sale', 'adjustment', 'void')),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli != 0),
  unit_cost_minor REAL CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
  transaction_id TEXT,
  stock_after_milli INTEGER NOT NULL CHECK (stock_after_milli >= 0),
  notes TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO stock_movements_v2 (
  id, organization_id, product_id, movement_date, movement_type,
  quantity_milli, unit_cost_minor, transaction_id, stock_after_milli,
  notes, created_by, created_at
)
SELECT
  id, organization_id, product_id, movement_date, movement_type,
  quantity_milli, unit_cost_minor, transaction_id, stock_after_milli,
  notes, created_by, created_at
FROM stock_movements;

DROP TABLE stock_movements;
ALTER TABLE stock_movements_v2 RENAME TO stock_movements;

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_product ON stock_movements(organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date ON stock_movements(organization_id, movement_date);

CREATE TABLE transaction_lines_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  line_type TEXT NOT NULL DEFAULT 'item' CHECK (line_type IN ('item', 'account', 'payment', 'tax', 'discount')),
  product_id TEXT,
  account_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER,
  unit_price_minor REAL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  line_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

INSERT INTO transaction_lines_v2 (
  id, organization_id, transaction_id, line_type, product_id, account_id,
  description, quantity_milli, unit_price_minor, amount_minor, line_order, created_at
)
SELECT
  id, organization_id, transaction_id, line_type, product_id, account_id,
  description, quantity_milli, unit_price_minor, amount_minor, line_order, created_at
FROM transaction_lines;

DROP TABLE transaction_lines;
ALTER TABLE transaction_lines_v2 RENAME TO transaction_lines;

CREATE INDEX IF NOT EXISTS idx_transaction_lines_org_transaction ON transaction_lines(organization_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_product ON transaction_lines(product_id);

PRAGMA foreign_keys = ON;
