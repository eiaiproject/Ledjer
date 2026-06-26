import { E2E } from "./env";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

export interface TestAccount {
  id: string;
  code: number;
  name: string;
  account_type: string;
}

/**
 * Fetch active accounts for an organization.
 */
export async function getOrgAccounts(orgId: string): Promise<TestAccount[]> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&is_active=eq.true&select=id,code,name,account_type&order=code`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
  return res.json();
}

/**
 * Get specific account by code.
 */
export async function getAccountByCode(
  orgId: string,
  code: number,
): Promise<TestAccount | null> {
  const accounts = await getOrgAccounts(orgId);
  return accounts.find((a) => a.code === code) || null;
}

/**
 * Get cash account (code 1110).
 */
export async function getCashAccount(orgId: string): Promise<TestAccount> {
  const account = await getAccountByCode(orgId, 1110);
  if (!account) throw new Error("Cash account (1110) not found");
  return account;
}

/**
 * Get bank account (code 1120).
 */
export async function getBankAccount(orgId: string): Promise<TestAccount> {
  const account = await getAccountByCode(orgId, 1120);
  if (!account) throw new Error("Bank account (1120) not found");
  return account;
}

/**
 * Get receivable account (code 1200).
 */
export async function getReceivableAccount(orgId: string): Promise<TestAccount> {
  const account = await getAccountByCode(orgId, 1200);
  if (!account) throw new Error("Receivable account (1200) not found");
  return account;
}

/**
 * Get payable account (code 2100).
 */
export async function getPayableAccount(orgId: string): Promise<TestAccount> {
  const account = await getAccountByCode(orgId, 2100);
  if (!account) throw new Error("Payable account (2100) not found");
  return account;
}
