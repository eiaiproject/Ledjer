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

-- Backfill Persediaan (asset) untuk organisasi yang belum punya.
-- Pakai kode 1130 bila bebas. Jika sudah terpakai (mis. akun kas/bank dari seed
-- E2E atau akun tambahan pengguna), pakai kode tertinggi+10 pada kelas asset
-- agar tidak menabrak UNIQUE(organization_id, code).
INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))) || '-' || lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(12))),
  id,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM accounts a WHERE a.organization_id = organizations.id AND a.code = '1130')
      THEN '1130'
    ELSE (SELECT CAST(MAX(CAST(a2.code AS INTEGER)) + 10 AS TEXT) FROM accounts a2 WHERE a2.organization_id = organizations.id AND a2.account_class = 'asset')
  END,
  'Persediaan', 'asset', NULL, 'inventory', 1, 1,
  unixepoch('subsec') * 1000, unixepoch('subsec') * 1000
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.organization_id = organizations.id AND a.account_kind = 'inventory'
);

-- Backfill HPP (expense) untuk organisasi yang belum punya.
-- Sama seperti di atas. Kode 6190 bila bebas, fallback kode tertinggi+10 pada
-- kelas expense bila sudah terpakai.
INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))) || '-' || lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(12))),
  id,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM accounts a WHERE a.organization_id = organizations.id AND a.code = '6190')
      THEN '6190'
    ELSE (SELECT CAST(MAX(CAST(a2.code AS INTEGER)) + 10 AS TEXT) FROM accounts a2 WHERE a2.organization_id = organizations.id AND a2.account_class = 'expense')
  END,
  'Harga Pokok Penjualan', 'expense', NULL, 'cogs', 1, 1,
  unixepoch('subsec') * 1000, unixepoch('subsec') * 1000
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.organization_id = organizations.id AND a.account_kind = 'cogs'
);

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
