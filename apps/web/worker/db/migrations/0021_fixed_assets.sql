PRAGMA foreign_keys = ON;

-- Fixed asset register.
-- Tracks acquisition, depreciation, disposal, and book value per asset.
CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  asset_code TEXT NOT NULL,           -- Human-readable code, e.g. "FA-2026-001"
  asset_name TEXT NOT NULL,
  asset_category TEXT NOT NULL CHECK (asset_category IN (
    'building', 'machinery', 'vehicle', 'office_equipment',
    'computer', 'furniture', 'land', 'other'
  )),
  description TEXT DEFAULT '',
  acquisition_date TEXT NOT NULL,      -- YYYY-MM-DD
  acquisition_cost_minor INTEGER NOT NULL,
  residual_value_minor INTEGER NOT NULL DEFAULT 0,
  useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0 AND useful_life_months <= 600),
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line' CHECK (depreciation_method IN (
    'straight_line', 'declining_balance', 'sum_of_years_digits'
  )),
  declining_balance_rate REAL,          -- e.g. 0.25 for 25% DB rate
  account_asset_id TEXT NOT NULL,        -- GL account for asset cost
  account_depreciation_id TEXT NOT NULL, -- GL account for accumulated depreciation
  account_expense_id TEXT NOT NULL,      -- GL account for depreciation expense
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'disposed', 'sold', 'impaired'
  )),
  disposal_date TEXT,                    -- YYYY-MM-DD
  disposal_price_minor INTEGER,
  disposal_reason TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (account_asset_id) REFERENCES accounts(id),
  FOREIGN KEY (account_depreciation_id) REFERENCES accounts(id),
  FOREIGN KEY (account_expense_id) REFERENCES accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_org ON fixed_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(organization_id, status);

-- Depreciation schedule/entries for each asset.
-- One row per monthly depreciation period.
CREATE TABLE IF NOT EXISTS asset_depreciation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  period TEXT NOT NULL,                -- YYYY-MM depreciation period
  expense_minor INTEGER NOT NULL,      -- Depreciation amount for this period
  accumulated_minor INTEGER NOT NULL,  -- Running accumulated depreciation
  book_value_minor INTEGER NOT NULL,   -- Book value after this period
  journal_entry_id TEXT,               -- Link to journal entry if posted
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'skipped')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_asset_depreciation_asset ON asset_depreciation(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_depreciation_period ON asset_depreciation(organization_id, period);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_depreciation_unique ON asset_depreciation(asset_id, period);

UPDATE app_metadata SET value = '21' WHERE key = 'schema.foundation';
