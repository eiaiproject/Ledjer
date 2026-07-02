import { test, expect } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import { ensureTestUser, loginUser, seedOrganization, seedTransaction } from "./fixtures/seed";
import { getOrgAccounts } from "./fixtures/accounts";

/**
 * CSV export formula injection regression tests.
 *
 * Verifies that trial balance, profit & loss, balance sheet, and general ledger
 * CSV exports use csv_escape() to prevent formula injection (=SUM, +cmd, @SUM)
 * and CRLF row injection in user-controlled account names.
 */

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

const DANGEROUS_NAMES = [
  { label: "equals formula", value: "=SUM(1,1)" },
  { label: "plus cmd injection", value: "+cmd|'/C calc'!A0" },
  { label: "at-sign formula", value: "@SUM(1+1)" },
  { label: "CRLF row injection", value: "Line1\r\nInjected,Row" },
];

/**
 * Rename account. Try RPC first (user JWT), fall back to service-role direct update.
 * RPC may fail for freshly-seeded orgs where the account was created by service role.
 */
async function renameAccount(
  token: string,
  accountId: string,
  newName: string,
): Promise<boolean> {
  // Try RPC with user JWT first
  const rpcRes = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/rename_account`, {
    method: "POST",
    headers: {
      apikey: E2E.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_account_id: accountId, p_new_name: newName }),
  });
  if (rpcRes.ok) return true;

  // Fall back: direct update via service role (bypasses RLS for test-only)
  const updateRes = await fetch(
    `${E2E.supabaseUrl}/rest/v1/accounts?id=eq.${accountId}`,
    {
      method: "PATCH",
      headers: SR_HEADERS,
      body: JSON.stringify({ name: newName }),
    },
  );
  return updateRes.ok;
}

async function exportCsv(
  token: string,
  rpcName: string,
  orgId: string,
  extraParams: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: E2E.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_organization_id: orgId, ...extraParams }),
  });
  return res.text();
}

function assertCsvSafe(rawCsv: string, dangerousValue: string) {
  // For dangerous values starting with =, +, @
  if (dangerousValue.startsWith("=") || dangerousValue.startsWith("+") || dangerousValue.startsWith("@")) {
    // CSV should not contain unescaped formula at field start (after comma or line start)
    const formulaRegex = new RegExp(`(^|,)${dangerousValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    expect(rawCsv).not.toMatch(formulaRegex);
  }

  // For CRLF injection
  if (dangerousValue.includes("\r\n")) {
    // The injected row should not appear as a separate CSV row
    expect(rawCsv).not.toMatch(/(^|[\r\n])Injected,Row/m);
  }

  // The dangerous value should not appear unescaped at all (defense in depth)
  // csv_escape wraps in quotes when dangerous characters detected
  if (!dangerousValue.includes("\r\n")) {
    // Check it doesn't appear as a raw unquoted field value
    const lines = rawCsv.split("\n");
    for (const line of lines) {
      const fields = line.split(",");
      for (const field of fields) {
        const trimmed = field.trim();
        // Should not exactly equal the dangerous value unquoted
        expect(trimmed).not.toBe(dangerousValue);
      }
    }
  }
}

if (E2E.isFullLocal) {
  test.describe("CSV Export Formula Injection Safety", () => {
    test("trial balance CSV export sanitizes formula prefixes and CRLF in account names", async () => {
      await ensureTestUser(E2E_OWNER);
      const ownerId = await ensureTestUser(E2E_OWNER);
      const orgId = await seedOrganization(ownerId, e2eName(`CSV TB ${Date.now()}`));
      const token = await loginUser(E2E_OWNER);

      // Seed a transaction so accounts appear in reports
      await seedTransaction(orgId);

      // Get any active account to rename (preferably a cash account)
      const accounts = await getOrgAccounts(orgId);
      const cashAccount = accounts.find((a) => a.account_type === "asset");
      expect(cashAccount).toBeTruthy();
      const originalName = cashAccount!.name;

      try {
      for (const { value } of DANGEROUS_NAMES) {
        // Rename account to dangerous value
        const renamed = await renameAccount(token, cashAccount.id, value);
        expect(renamed).toBeTruthy();

        // Export trial balance CSV
        const csv = await exportCsv(token, "export_trial_balance_csv", orgId);

        // Verify header
        expect(csv).toContain("Kode Akun,Nama Akun,Debit,Kredit");

        // Verify the CSV is safe
        assertCsvSafe(csv, value);
      }
      } finally {
        // Restore original name
        await renameAccount(token, cashAccount.id, originalName);
      }
    });

    test("profit loss CSV export sanitizes formula prefixes and CRLF in revenue account names", async () => {
      const ownerId = await ensureTestUser(E2E_OWNER);
      const orgId = await seedOrganization(ownerId, e2eName(`CSV PL ${Date.now()}`));
      const token = await loginUser(E2E_OWNER);

      // Seed a transaction to generate revenue
      await seedTransaction(orgId);

      // Find a revenue account
      const accounts = await (await fetch(
        `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&account_type=eq.revenue&select=id,name,code&limit=1`,
        { headers: SR_HEADERS },
      )).json();

      if (!accounts || accounts.length === 0) {
        // No revenue account — skip gracefully
        return;
      }

      const revenueAccount = accounts[0];
      const originalName = revenueAccount.name;

      try {
        for (const { value } of DANGEROUS_NAMES) {
          await renameAccount(token, revenueAccount.id, value);

          const csv = await exportCsv(token, "export_profit_loss_csv", orgId);

          // Verify header
          expect(csv).toContain("Bagian,Kode Akun,Nama Akun,Jumlah");

          assertCsvSafe(csv, value);
        }
      } finally {
        await renameAccount(token, revenueAccount.id, originalName);
      }
    });

    test("balance sheet CSV export sanitizes formula prefixes and CRLF in asset account names", async () => {
      const ownerId = await ensureTestUser(E2E_OWNER);
      const orgId = await seedOrganization(ownerId, e2eName(`CSV BS ${Date.now()}`));
      const token = await loginUser(E2E_OWNER);

      await seedTransaction(orgId);

      const accounts = await getOrgAccounts(orgId);
      const cashAccount = accounts.find((a) => a.account_type === "asset");
      expect(cashAccount).toBeTruthy();
      const originalName = cashAccount!.name;

      try {
        for (const { value } of DANGEROUS_NAMES) {
          await renameAccount(token, cashAccount.id, value);

          const csv = await exportCsv(token, "export_balance_sheet_csv", orgId);

          expect(csv).toContain("Bagian,Kode Akun,Nama Akun,Jumlah");

          assertCsvSafe(csv, value);
        }
      } finally {
        await renameAccount(token, cashAccount.id, originalName);
      }
    });

    test("general ledger CSV export sanitizes formula prefixes and CRLF in account names", async () => {
      const ownerId = await ensureTestUser(E2E_OWNER);
      const orgId = await seedOrganization(ownerId, e2eName(`CSV GL ${Date.now()}`));
      const token = await loginUser(E2E_OWNER);

      await seedTransaction(orgId);

      const accounts = await getOrgAccounts(orgId);
      const cashAccount = accounts.find((a) => a.account_type === "asset");
      expect(cashAccount).toBeTruthy();
      const originalName = cashAccount!.name;

      try {
        for (const { value } of DANGEROUS_NAMES) {
          await renameAccount(token, cashAccount.id, value);

          const csv = await exportCsv(token, "export_general_ledger_csv", orgId, {
            p_account_id: cashAccount.id,
          });

          assertCsvSafe(csv, value);
        }
      } finally {
        await renameAccount(token, cashAccount.id, originalName);
      }
    });
  });
}
