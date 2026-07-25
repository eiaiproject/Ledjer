-- P4.6: Performance indexes for report queries
-- These indexes accelerate the most frequently run report queries:
-- trial balance, profit & loss, balance sheet, general ledger, dashboard summary

-- Composite index for journal_lines + journal_entries JOIN on status + date
-- Used by: getTrialBalance, getProfitLoss, getBalanceSheet, getDashboardSummary
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status_date
  ON journal_entries(organization_id, status, entry_date);

-- Covering index for journal_lines to avoid table lookups in report queries
-- Used by: all report queries that aggregate debit/credit by account
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_entry
  ON journal_lines(organization_id, journal_entry_id, account_id, debit_minor, credit_minor);

-- Index for accounts by type (used in profit/loss and balance sheet)
CREATE INDEX IF NOT EXISTS idx_accounts_org_type
  ON accounts(organization_id, account_type, code);

-- Index for accounts receivable/payable subtype queries (dashboard summary)
CREATE INDEX IF NOT EXISTS idx_accounts_org_subtype
  ON accounts(organization_id, account_subtype);

-- Index for transactions list queries with date range and status filters
CREATE INDEX IF NOT EXISTS idx_transactions_org_date_status
  ON transactions(organization_id, transaction_date, status)
  WHERE original_transaction_id IS NULL;
