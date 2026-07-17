PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token_hash ON email_verifications(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  error_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created ON login_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_created ON login_attempts(ip_address, created_at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  provider_account_id TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('service', 'simple_trading')),
  base_currency TEXT NOT NULL DEFAULT 'IDR',
  books_start_date TEXT NOT NULL,
  default_reporting_period TEXT NOT NULL DEFAULT 'monthly' CHECK (default_reporting_period IN ('monthly')),
  onboarding_status TEXT NOT NULL DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'removed')),
  invited_by TEXT,
  joined_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user_org ON organization_members(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_members_org_status ON organization_members(organization_id, status);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by TEXT NOT NULL,
  accepted_by TEXT,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id),
  FOREIGN KEY (accepted_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash ON organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_org_status ON organization_invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON organization_invitations(email);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'cogs', 'expense', 'other_income', 'other_expense')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  parent_account_id TEXT,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_cash_account INTEGER NOT NULL DEFAULT 0 CHECK (is_cash_account IN (0, 1)),
  cash_account_type TEXT CHECK (cash_account_type IS NULL OR cash_account_type IN ('cash', 'bank', 'qris')),
  report_group TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_account_id) REFERENCES accounts(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_org_code ON accounts(organization_id, code);
CREATE INDEX IF NOT EXISTS idx_accounts_org ON accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounts_org_type ON accounts(organization_id, account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id);

CREATE TABLE IF NOT EXISTS account_mappings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('service', 'simple_trading')),
  transaction_type TEXT NOT NULL,
  category_name TEXT NOT NULL,
  debit_account_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (debit_account_id) REFERENCES accounts(id),
  FOREIGN KEY (credit_account_id) REFERENCES accounts(id),
  UNIQUE (organization_id, business_type, transaction_type, category_name)
);

CREATE INDEX IF NOT EXISTS idx_account_mappings_org ON account_mappings(organization_id);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  party_type TEXT NOT NULL DEFAULT 'other' CHECK (party_type IN ('customer', 'supplier', 'employee', 'owner', 'other')),
  email TEXT COLLATE NOCASE,
  phone TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parties_org ON parties(organization_id);
CREATE INDEX IF NOT EXISTS idx_parties_org_type ON parties(organization_id, party_type);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  selling_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_minor >= 0),
  average_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (average_cost_minor >= 0),
  current_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (current_stock_milli >= 0),
  min_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_milli >= 0),
  inventory_account_id TEXT,
  cogs_account_id TEXT,
  revenue_account_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_account_id) REFERENCES accounts(id),
  FOREIGN KEY (cogs_account_id) REFERENCES accounts(id),
  FOREIGN KEY (revenue_account_id) REFERENCES accounts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_code ON products(organization_id, code);
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_org_active ON products(organization_id, is_active);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  party_id TEXT,
  category_name TEXT,
  cash_account_id TEXT,
  destination_cash_account_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
  due_date TEXT,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'voided', 'reversed')),
  idempotency_key TEXT,
  posted_at INTEGER,
  posted_by TEXT,
  voided_at INTEGER,
  voided_by TEXT,
  void_reason TEXT,
  original_transaction_id TEXT,
  reversal_transaction_id TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id),
  FOREIGN KEY (cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY (destination_cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY (posted_by) REFERENCES users(id),
  FOREIGN KEY (voided_by) REFERENCES users(id),
  FOREIGN KEY (original_transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (reversal_transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_org_number ON transactions(organization_id, transaction_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_org_idempotency ON transactions(organization_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON transactions(organization_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_org_status ON transactions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_party ON transactions(party_id);

CREATE TABLE IF NOT EXISTS transaction_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  line_type TEXT NOT NULL DEFAULT 'item' CHECK (line_type IN ('item', 'account', 'payment', 'tax', 'discount')),
  product_id TEXT,
  account_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER,
  unit_price_minor INTEGER,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  line_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_lines_org_transaction ON transaction_lines(organization_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_product ON transaction_lines(product_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  entry_number TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'normal' CHECK (entry_type IN ('normal', 'opening_balance', 'adjustment', 'reversal')),
  transaction_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided', 'reversed')),
  reversed_entry_id TEXT,
  reversal_reason TEXT,
  posted_at INTEGER,
  posted_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (reversed_entry_id) REFERENCES journal_entries(id),
  FOREIGN KEY (posted_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_org_number ON journal_entries(organization_id, entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date ON journal_entries(organization_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction ON journal_entries(transaction_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  journal_entry_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  party_id TEXT,
  debit_minor INTEGER NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  description TEXT NOT NULL DEFAULT '',
  line_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  CHECK (
    (debit_minor > 0 AND credit_minor = 0)
    OR (debit_minor = 0 AND credit_minor > 0)
  ),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (party_id) REFERENCES parties(id)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_org_account ON journal_lines(organization_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_party ON journal_lines(party_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening', 'purchase', 'sale', 'adjustment', 'void')),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli != 0),
  unit_cost_minor INTEGER CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
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

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_product ON stock_movements(organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date ON stock_movements(organization_id, movement_date);

CREATE TABLE IF NOT EXISTS period_locks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  locked_through_date TEXT NOT NULL,
  reason TEXT,
  locked_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_period_locks_org_date ON period_locks(organization_id, locked_through_date);

CREATE TABLE IF NOT EXISTS organization_document_counters (
  organization_id TEXT NOT NULL,
  counter_name TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, counter_name),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  request_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(organization_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  export_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'expired')),
  storage_key TEXT,
  error_message TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_org_created ON export_jobs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
