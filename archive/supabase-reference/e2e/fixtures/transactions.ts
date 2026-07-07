import { E2E } from "./env";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

export interface TestTransaction {
  id: string;
  transaction_number: string;
  transaction_type: string;
  amount: number;
  status: string;
  payment_status: string;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_type: string;
  description: string;
  status: string;
  journal_lines: Array<{
    account_id: string;
    debit: number;
    credit: number;
    description: string;
  }>;
}

/**
 * Fetch transactions for an org.
 */
export async function getOrgTransactions(orgId: string): Promise<TestTransaction[]> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/transactions?organization_id=eq.${orgId}&select=*&order=posted_at.desc`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  return res.json();
}

/**
 * Fetch journal entries for an org.
 */
export async function getOrgJournalEntries(orgId: string): Promise<JournalEntry[]> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/journal_entries?organization_id=eq.${orgId}&select=*,journal_lines(*)`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) throw new Error(`Failed to fetch journal entries: ${res.status}`);
  return res.json();
}

/**
 * Get account balance by account code.
 */
export async function getAccountBalance(
  orgId: string,
  accountCode: number,
): Promise<number> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/rpc/get_account_balance?p_org_id=${orgId}&p_account_code=${accountCode}`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) throw new Error(`Failed to get balance: ${res.status}`);
  const data = await res.json();
  return Number(data || 0);
}

/**
 * Cleanup E2E transactions (safe: only E2E-prefixed).
 */
export async function cleanupE2ETransactions(orgId: string): Promise<void> {
  // Delete journal lines first (FK)
  const journalRes = await fetch(
    `${E2E.supabaseUrl}/rest/v1/journal_entries?organization_id=eq.${orgId}&description=like.[E2E]*&select=id`,
    { headers: SR_HEADERS },
  );
  if (journalRes.ok) {
    const entries = await journalRes.json();
    for (const entry of entries) {
      await fetch(`${E2E.supabaseUrl}/rest/v1/journal_lines?journal_entry_id=eq.${entry.id}`, {
        method: "DELETE",
        headers: SR_HEADERS,
      }).catch(() => {});
    }
    await fetch(
      `${E2E.supabaseUrl}/rest/v1/journal_entries?organization_id=eq.${orgId}&description=like.[E2E]*`,
      { method: "DELETE", headers: SR_HEADERS },
    ).catch(() => {});
  }

  // Delete E2E transactions
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/transactions?organization_id=eq.${orgId}&description=like.[E2E]*`,
    { method: "DELETE", headers: SR_HEADERS },
  ).catch(() => {});
}
