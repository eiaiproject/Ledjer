export const CORE_TABLES = [
  "app_metadata",
  "users",
  "sessions",
  "rate_limits",
  "accounts",
  "products",
  "transactions",
  "journal_entries",
  "journal_lines",
  "stock_movements",
  "audit_logs",
  "oauth_accounts",
] as const;

/**
 * Tables whose rows belong to exactly one user (1 user = 1 buku). Every query
 * against these must be scoped by user_id — the single-user replacement for the
 * old organization_id (org) scoping.
 */
export const USER_SCOPED_TABLES = [
  "accounts",
  "products",
  "transactions",
  "journal_entries",
  "journal_lines",
  "stock_movements",
  "audit_logs",
] as const;

export const CORE_INDEXES = [
  "idx_users_email",
  "idx_sessions_user",
  "idx_sessions_token_hash",
  "idx_sessions_expires",
  "idx_rate_limits_bucket_created",
  "idx_accounts_user_code",
  "idx_accounts_user_name",
  "idx_accounts_user_class",
  "idx_accounts_user_active",
  "idx_accounts_user_subtype",
  "idx_products_user_code",
  "idx_products_user_name",
  "idx_products_user_active",
  "idx_transactions_user_number",
  "idx_transactions_user_idempotency",
  "idx_transactions_user_date",
  "idx_transactions_user_status",
  "idx_transactions_user_type",
  "idx_transactions_user_created",
  "idx_journal_entries_transaction",
  "idx_journal_entries_user_date",
  "idx_journal_lines_entry",
  "idx_journal_lines_user_account",
  "idx_journal_lines_user_account_date",
  "idx_stock_movements_transaction",
  "idx_stock_movements_product",
  "idx_audit_logs_user_created",
  "idx_audit_logs_entity",
] as const;

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
  "purchase",
] as const;
export const TRANSACTION_STATUS_VALUES = ["posted", "voided"] as const;

export type CoreTable = (typeof CORE_TABLES)[number];
export type UserScopedTable = (typeof USER_SCOPED_TABLES)[number];
export type AccountClass = (typeof ACCOUNT_CLASS_VALUES)[number];
export type TransactionType = (typeof TRANSACTION_TYPE_VALUES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUS_VALUES)[number];
