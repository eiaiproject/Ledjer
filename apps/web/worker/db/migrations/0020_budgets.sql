PRAGMA foreign_keys = ON;

-- Account-level budgets for monthly/annual periods.
-- Supports optional dimension (branch, project, cost center) for future use.
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  period_from TEXT NOT NULL,          -- YYYY-MM-DD start of budget period
  period_to TEXT NOT NULL,            -- YYYY-MM-DD end of budget period
  amount_minor INTEGER NOT NULL DEFAULT 0, -- Budget amount in minor units
  dimension_type TEXT,                -- Optional: 'branch', 'project', 'cost_center'
  dimension_value TEXT,               -- Optional dimension identifier
  notes TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_budgets_org_period ON budgets(organization_id, period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_budgets_account ON budgets(organization_id, account_id);
CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(organization_id, is_active);

-- Budget lines for more granular (monthly) breakdown within an annual budget.
-- Allows users to set month-by-month targets within the overall budget period.
CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  month TEXT NOT NULL,                -- YYYY-MM month identifier
  amount_minor INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_month ON budget_lines(organization_id, month);

UPDATE app_metadata SET value = '20' WHERE key = 'schema.foundation';
