export const CORE_TABLES = [
  "app_metadata",
  "users",
  "organizations",
  "memberships",
  "sessions",
  "rate_limits",
  "accounts",
  "transactions",
  "journal_entries",
  "journal_lines",
  "audit_logs",
] as const;

export const TENANT_SCOPED_TABLES = [
  "memberships",
  "accounts",
  "transactions",
  "journal_entries",
  "journal_lines",
  "audit_logs",
] as const;

export const CORE_INDEXES = [
  "idx_users_email",
  "idx_memberships_org",
  "idx_sessions_user",
  "idx_sessions_token_hash",
  "idx_sessions_expires",
  "idx_sessions_org",
  "idx_rate_limits_bucket_created",
  "idx_accounts_org_code",
  "idx_accounts_org_name",
  "idx_accounts_org_class",
  "idx_accounts_org_active",
  "idx_accounts_org_subtype",
  "idx_transactions_number",
  "idx_transactions_org_idempotency",
  "idx_transactions_org_date",
  "idx_transactions_org_status",
  "idx_transactions_org_type",
  "idx_transactions_org_created",
  "idx_journal_entries_transaction",
  "idx_journal_entries_org_date",
  "idx_journal_lines_entry",
  "idx_journal_lines_org_account",
  "idx_journal_lines_org_account_date",
  "idx_audit_logs_org_created",
  "idx_audit_logs_entity",
] as const;

export const ROLE_VALUES = ["owner"] as const;
export const ACCOUNT_CLASS_VALUES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;
export const TRANSACTION_TYPE_VALUES = [
  "cash_in",
  "cash_out",
  "transfer",
  "owner_deposit",
  "owner_withdrawal",
] as const;
export const TRANSACTION_STATUS_VALUES = ["posted", "voided"] as const;

export type CoreTable = (typeof CORE_TABLES)[number];
export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];
export type Role = (typeof ROLE_VALUES)[number];
export type AccountClass = (typeof ACCOUNT_CLASS_VALUES)[number];
export type TransactionType = (typeof TRANSACTION_TYPE_VALUES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUS_VALUES)[number];