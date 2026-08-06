PRAGMA foreign_keys = OFF;

-- Stok Opname (stock_count) and sale/purchase returns (sale_return,
-- purchase_return) insert stock movements, but the CHECK constraint only
-- allowed opening/purchase/sale/adjustment/void — those INSERTs failed at
-- runtime. SQLite requires a table recreate to change a CHECK constraint.
-- Recreated table keeps the REAL unit_cost_minor from 0030.

CREATE TABLE stock_movements_v3 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'opening', 'purchase', 'sale', 'adjustment', 'void',
    'stock_count', 'sale_return', 'purchase_return' -- NOSONAR plsql:S1192
  )),
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

INSERT INTO stock_movements_v3 (
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
ALTER TABLE stock_movements_v3 RENAME TO stock_movements;

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_product ON stock_movements(organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date ON stock_movements(organization_id, movement_date);

PRAGMA foreign_keys = ON;

UPDATE app_metadata SET value = '31' WHERE key = 'schema.foundation';
