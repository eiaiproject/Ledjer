/**
 * Account helpers for E2E tests using Cloudflare Worker API.
 * No Supabase dependency — all account reads go through /api/accounts/*.
 */

import { E2E } from "./env";

export interface TestAccount {
  id: string;
  code: number;
  name: string;
  accountType: string;
}

/**
 * Fetch active accounts for an organization via Worker API.
 */
export async function getOrgAccounts(
  sessionToken: string,
): Promise<TestAccount[]> {
  const res = await fetch(`${E2E.baseUrl}/api/accounts`, {
    headers: { Cookie: `ledjer_session=${sessionToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`);
  const data = await res.json();
  return data.accounts || data || [];
}

/**
 * Get account by code.
 */
export async function getAccountByCode(
  sessionToken: string,
  code: number,
): Promise<TestAccount | null> {
  const accounts = await getOrgAccounts(sessionToken);
  return accounts.find((a) => a.code === code) || null;
}

/** Get cash account (code 1110). */
export async function getCashAccount(sessionToken: string): Promise<TestAccount> {
  const account = await getAccountByCode(sessionToken, 1110);
  if (!account) throw new Error("Cash account (1110) not found");
  return account;
}

/** Get bank account (code 1120). */
export async function getBankAccount(sessionToken: string): Promise<TestAccount> {
  const account = await getAccountByCode(sessionToken, 1120);
  if (!account) throw new Error("Bank account (1120) not found");
  return account;
}

/** Get receivable account (code 1200). */
export async function getReceivableAccount(sessionToken: string): Promise<TestAccount> {
  const account = await getAccountByCode(sessionToken, 1200);
  if (!account) throw new Error("Receivable account (1200) not found");
  return account;
}

/** Get payable account (code 2100). */
export async function getPayableAccount(sessionToken: string): Promise<TestAccount> {
  const account = await getAccountByCode(sessionToken, 2100);
  if (!account) throw new Error("Payable account (2100) not found");
  return account;
}
