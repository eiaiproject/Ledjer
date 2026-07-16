export const CORE_TABLES = [
  "users",
  "sessions",
  "email_verifications",
  "password_reset_tokens",
  "login_attempts",
  "oauth_accounts",
  "organizations",
  "organization_members",
  "organization_invitations",
  "accounts",
  "parties",
  "products",
  "transactions",
  "transaction_lines",
  "journal_entries",
  "journal_lines",
  "stock_movements",
  "period_locks",
  "organization_document_counters",
  "audit_logs",
] as const;

export const TENANT_SCOPED_TABLES = [
  "organization_members",
  "organization_invitations",
  "accounts",
  "parties",
  "products",
  "transactions",
  "transaction_lines",
  "journal_entries",
  "journal_lines",
  "stock_movements",
  "period_locks",
  "organization_document_counters",
  "audit_logs",
] as const;

export const CORE_INDEXES = [
  "idx_sessions_user_id",
  "idx_sessions_token_hash",
  "idx_sessions_current_organization",
  "idx_members_user_org",
  "idx_accounts_org",
  "idx_products_org",
  "idx_transactions_org_date",
  "idx_journal_entries_org_date",
  "idx_journal_lines_org_account",
  "idx_audit_logs_org_created",
] as const;

export const ROLE_VALUES = ["owner", "admin", "member", "viewer"] as const;
export const ACCOUNT_TYPE_VALUES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "cogs",
  "expense",
  "other_income",
  "other_expense",
] as const;
export const NORMAL_BALANCE_VALUES = ["debit", "credit"] as const;

export type CoreTable = (typeof CORE_TABLES)[number];
export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];
export type Role = (typeof ROLE_VALUES)[number];
export type AccountType = (typeof ACCOUNT_TYPE_VALUES)[number];
export type NormalBalance = (typeof NORMAL_BALANCE_VALUES)[number];
