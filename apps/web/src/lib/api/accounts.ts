import { apiRequest } from "./client";

export type AccountClass = "asset" | "liability" | "equity" | "income" | "expense";
export type CashBankSubtype = "cash" | "bank";

export interface Account {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  account_class: AccountClass;
  account_subtype: CashBankSubtype | null;
  is_system: number;
  is_active: number;
  created_at: number;
  updated_at: number;
  balance_idr?: number;
}

interface AccountsResponse {
  accounts: Account[];
}

interface AccountResponse {
  account: Account;
}

export interface AccountListFilters {
  includeInactive?: boolean;
  subtype?: CashBankSubtype;
}

export function listAccounts(filters: AccountListFilters = {}): Promise<Account[]> {
  const params = new URLSearchParams();
  if (filters.includeInactive) params.set("includeInactive", "true");
  if (filters.subtype) params.set("subtype", filters.subtype);
  const query = params.toString();
  const path = query ? `/api/accounts?${query}` : "/api/accounts";
  return apiRequest<AccountsResponse>(path).then((data) => data.accounts);
}

export function listCashBankAccounts(): Promise<Account[]> {
  return listAccounts({ subtype: "cash" }).then((cash) =>
    listAccounts({ subtype: "bank" }).then((bank) => [...cash, ...bank]),
  );
}

export function createCashBankAccount(
  subtype: CashBankSubtype,
  name: string,
): Promise<Account> {
  return apiRequest<AccountResponse>("/api/accounts/cash-bank", {
    method: "POST",
    body: JSON.stringify({ subtype, name }),
  }).then((data) => data.account);
}

export function patchAccount(
  accountId: string,
  input: { name?: string; isActive?: boolean },
): Promise<Account> {
  return apiRequest<AccountResponse>(`/api/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((data) => data.account);
}