PRAGMA foreign_keys = ON;

-- Recurring transactions: templates for automatically creating transactions
-- on a schedule. Supports daily, weekly, monthly, yearly, and custom intervals.
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,                                    -- e.g. "Sewa Kantor", "Langganan Internet"
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'cash_sale', 'credit_sale', 'receive_receivable',
    'cash_purchase', 'credit_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer'
  )),
  frequency TEXT NOT NULL CHECK (frequency IN (
    'daily', 'weekly', 'monthly', 'yearly', 'custom_days'
  )),
  interval_value INTEGER NOT NULL DEFAULT 1,              -- multiplier: every 2 weeks, every 3 months, etc.
  day_of_month INTEGER,                                   -- for monthly (1-31)
  day_of_week INTEGER,                                    -- for weekly (0=Sun, 1=Mon, ..., 6=Sat)
  month_of_year INTEGER,                                  -- for yearly (1-12)
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  party_id TEXT,
  cash_account_id TEXT,
  debit_account_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  start_date TEXT NOT NULL,                                -- first scheduled execution date
  end_date TEXT,                                          -- optional end date (NULL = indefinite)
  next_execution_date TEXT,                               -- next date when transaction should fire
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'completed', 'cancelled'
  )),
  post_as_draft INTEGER NOT NULL DEFAULT 0,                -- 1 = create as draft (manual review), 0 = post directly
  execution_count INTEGER NOT NULL DEFAULT 0,               -- how many times it has executed
  last_executed_at INTEGER,
  skip_next INTEGER NOT NULL DEFAULT 0,                     -- skip the next occurrence
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY (debit_account_id) REFERENCES accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_org ON recurring_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_status ON recurring_transactions(status);
CREATE INDEX IF NOT EXISTS idx_recurring_next_exec ON recurring_transactions(next_execution_date);
CREATE INDEX IF NOT EXISTS idx_recurring_org_status ON recurring_transactions(organization_id, status);

-- Execution log: tracks each scheduled execution attempt
CREATE TABLE IF NOT EXISTS recurring_execution_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  recurring_transaction_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,                            -- the date that was scheduled
  executed_at INTEGER NOT NULL,                            -- when execution ran
  transaction_id TEXT,                                      -- created transaction (NULL if failed/skipped)
  status TEXT NOT NULL CHECK (status IN (
    'success', 'failed', 'skipped'
  )),
  error_message TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (recurring_transaction_id) REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_log_recurring ON recurring_execution_log(recurring_transaction_id);
CREATE INDEX IF NOT EXISTS idx_recurring_log_status ON recurring_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_recurring_log_scheduled ON recurring_execution_log(scheduled_date);

UPDATE app_metadata SET value = '15' WHERE key = 'schema.foundation';
