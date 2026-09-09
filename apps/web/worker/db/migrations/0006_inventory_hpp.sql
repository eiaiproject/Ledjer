-- Ledjer inventory & HPP: master produk (moving-average cost) + akun Persediaan/HPP.
--
-- Tiga bagian:
--  1. account_kind pada accounts (inventory | cogs) agar service bisa menemukan
--     akun Persediaan & HPP walau diganti nama.
--  2. Backfill akun Persediaan (1130) & HPP (6190) untuk organisasi yang dibuat
--     sebelum migrasi ini. Organisasi baru mendapatkannya via DEFAULT_ACCOUNTS.
--  3. Tabel products + stock_movements sebagai buku stok & dasar hitung WAC.

PRAGMA foreign_keys = ON;

ALTER TABLE accounts ADD COLUMN account_kind TEXT CHECK (account_kind IN ('inventory', 'cogs') OR account_kind IS NULL);

-- Backfill akun Persediaan (asset/inventory) & HPP (expense/cogs) untuk
-- organisasi yang belum punya account_kind tersebut. Kode default (1130/6190)
-- dipakai bila bebas; bila sudah terpakai (mis. akun kas/bank dari seed E2E
-- atau akun tambahan pengguna), pakai kode tertinggi+10 pada kelasnya agar
-- tidak menabrak UNIQUE(organization_id, code).
WITH params(account_kind, default_code, name, account_class) AS (
  VALUES
    ('inventory', '1130', 'Persediaan', 'asset'),
    ('cogs', '6190', 'Harga Pokok Penjualan', 'expense')
),
missing AS (
  SELECT o.id AS organization_id, p.account_kind, p.default_code, p.name, p.account_class
  FROM organizations o
  CROSS JOIN params p
  LEFT JOIN accounts has_kind
    ON has_kind.organization_id = o.id
    AND has_kind.account_kind = p.account_kind
  WHERE has_kind.id IS NULL
),
coded AS (
  SELECT
    m.organization_id, m.account_kind, m.default_code, m.name, m.account_class,
    taken.code AS taken_code,
    (
      SELECT CAST(MAX(CAST(a.code AS INTEGER)) + 10 AS TEXT)
      FROM accounts a
      WHERE a.organization_id = m.organization_id
        AND a.account_class = m.account_class
    ) AS fallback_code
  FROM missing m
  LEFT JOIN accounts taken
    ON taken.organization_id = m.organization_id
    AND taken.code = m.default_code
)
INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))) || '-' || lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(12))),
  organization_id,
  CASE WHEN taken_code IS NULL THEN default_code ELSE fallback_code END,
  name, account_class, NULL, account_kind, 1, 1,
  unixepoch('subsec') * 1000, unixepoch('subsec') * 1000
FROM coded;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  selling_price_idr INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_idr >= 0),
  current_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (current_stock_milli >= 0),
  average_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (average_cost_minor >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_code ON products(organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_name ON products(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_products_org_active ON products(organization_id, is_active);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli != 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  cost_total_idr INTEGER NOT NULL CHECK (cost_total_idr >= 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_transaction ON stock_movements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(organization_id, product_id, created_at);
