import { apiRequest, jsonBody } from "./client";

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cogs"
  | "expense"
  | "other_income"
  | "other_expense";

export type NormalBalance = "debit" | "credit";
export type CashBankKind = "cash" | "bank" | "qris" | "ewallet";

export interface Account {
  id: string;
  code: number;
  name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  parent_account_id: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  is_cash_account: boolean;
  cash_account_type: "cash" | "bank" | "qris" | null;
  report_group: string | null;
}

interface AccountsResponse {
  accounts: Account[];
}

interface AccountResponse {
  account: Account;
}

export interface AccountListFilters {
  active?: boolean;
  cashBankOnly?: boolean;
  accountTypes?: AccountType[];
}

export function listAccounts(filters: AccountListFilters = {}): Promise<Account[]> {
  const params = new URLSearchParams();
  if (filters.active !== undefined) params.set("active", String(filters.active));
  if (filters.cashBankOnly) params.set("kind", "cash-bank");
  if (filters.accountTypes?.length) {
    params.set("accountTypes", filters.accountTypes.join(","));
  }
  const query = params.toString();
  return apiRequest<AccountsResponse>(`/api/accounts${query ? `?${query}` : ""}`).then(
    (data) => data.accounts,
  );
}

export function listCashBankAccounts(): Promise<Account[]> {
  return apiRequest<AccountsResponse>("/api/accounts/cash-bank").then(
    (data) => data.accounts,
  );
}

export function createCashBankAccount(
  kind: CashBankKind,
  name: string,
): Promise<Account> {
  return apiRequest<AccountResponse>("/api/accounts/cash-bank", {
    method: "POST",
    body: jsonBody({ kind, name }),
  }).then((data) => data.account);
}

export function generateCashBankCode(kind: CashBankKind): Promise<number> {
  return apiRequest<{ code: number }>("/api/accounts/generate-code", {
    method: "POST",
    body: jsonBody({ kind }),
  }).then((data) => data.code);
}

export function updateAccountName(
  accountId: string,
  name: string,
): Promise<Account> {
  return apiRequest<AccountResponse>(`/api/accounts/${accountId}`, {
    method: "PATCH",
    body: jsonBody({ name }),
  }).then((data) => data.account);
}
