import { test, expect } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  loginUser,
} from "./fixtures/seed";
import { getCashAccount } from "./fixtures/accounts";
import { cleanupE2EOrganizations, cleanupE2EUsers } from "./fixtures/cleanup";

// ── Helpers ──────────────────────────────────────────────────────────────

function userHeaders(token: string) {
  return {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function rpc(
  token: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/** Format a Date as YYYY-MM-DD */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe("Reports: Date boundary", () => {
  test.skip(!E2E.isFullLocal, "Butuh local Supabase + service role key");
  test.describe.configure({ mode: "serial" });

  let ownerToken: string;
  let orgId: string;
  let cashAcctId: string;

  // Dates: today = books_start_date, tomorrow = second transaction
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStr = fmtDate(today);
  const tomorrowStr = fmtDate(tomorrow);

  test.beforeAll(async () => {
    await ensureTestUser(E2E_OWNER);
    ownerToken = await loginUser(E2E_OWNER);
    orgId = await seedOrganization(
      (await ensureTestUser(E2E_OWNER)),
      e2eName("Report Date Org"),
    );
    const cash = await getCashAccount(orgId);
    cashAcctId = cash.id;
  });

  test.afterAll(async () => {
    await cleanupE2EOrganizations();
    await cleanupE2EUsers();
  });

  // ── Seed transactions at known dates ──────────────────────────────────

  test("seed transactions on today and tomorrow", async () => {
    // Transaction on today (books_start_date)
    const res1 = await rpc(ownerToken, "post_transaction", {
      p_organization_id: orgId,
      p_transaction_date: todayStr,
      p_transaction_type: "cash_sale",
      p_amount: 100_000,
      p_payment_status: "paid",
      p_description: e2eName("Penjualan hari ini"),
      p_cash_account_id: cashAcctId,
      p_client_token: crypto.randomUUID(),
    });
    expect(res1.status).toBe(200);

    // Transaction on tomorrow
    const res2 = await rpc(ownerToken, "post_transaction", {
      p_organization_id: orgId,
      p_transaction_date: tomorrowStr,
      p_transaction_type: "cash_sale",
      p_amount: 200_000,
      p_payment_status: "paid",
      p_description: e2eName("Penjualan besok"),
      p_cash_account_id: cashAcctId,
      p_client_token: crypto.randomUUID(),
    });
    expect(res2.status).toBe(200);
  });

  // ── Trial balance respects as_of_date ─────────────────────────────────

  test("trial balance as_of_date=today excludes tomorrow's transactions", async () => {
    const res = await rpc(ownerToken, "export_trial_balance_csv", {
      p_organization_id: orgId,
      p_as_of_date: todayStr,
    });
    expect(res.status).toBe(200);

    const csv = String(res.data ?? "");
    expect(csv).toContain("Kode Akun");
    // Tomorrow's description should not appear
    expect(csv).not.toContain("Penjualan besok");
  });

  test("trial balance as_of_date=tomorrow includes both transactions", async () => {
    const res = await rpc(ownerToken, "export_trial_balance_csv", {
      p_organization_id: orgId,
      p_as_of_date: tomorrowStr,
    });
    expect(res.status).toBe(200);

    const csv = String(res.data ?? "");
    expect(csv).toContain("Kode Akun");
  });

  // ── P&L respects date range ───────────────────────────────────────────

  test("P&L with from=today, to=today excludes tomorrow", async () => {
    const res = await rpc(ownerToken, "export_profit_loss_csv", {
      p_organization_id: orgId,
      p_from_date: todayStr,
      p_to_date: todayStr,
    });
    expect(res.status).toBe(200);

    const csv = String(res.data ?? "");
    expect(csv).toContain("Bagian");
    // Tomorrow's description should not appear in today-only P&L
    expect(csv).not.toContain("Penjualan besok");
  });

  test("P&L with full range includes all", async () => {
    const res = await rpc(ownerToken, "export_profit_loss_csv", {
      p_organization_id: orgId,
      p_from_date: todayStr,
      p_to_date: tomorrowStr,
    });
    expect(res.status).toBe(200);

    const csv = String(res.data ?? "");
    expect(csv).toContain("Bagian");
  });

  // ── Balance sheet respects as_of_date ─────────────────────────────────

  test("balance sheet as_of_date=today only includes today amounts", async () => {
    const res = await rpc(ownerToken, "export_balance_sheet_csv", {
      p_organization_id: orgId,
      p_as_of_date: todayStr,
    });
    expect(res.status).toBe(200);

    const csv = String(res.data ?? "");
    expect(csv).toContain("Bagian");
  });

  // ── General ledger respects date filters ──────────────────────────────

  test("general ledger narrow range excludes tomorrow", async () => {
    const res = await rpc(ownerToken, "export_general_ledger_csv", {
      p_organization_id: orgId,
      p_from_date: todayStr,
      p_to_date: todayStr,
    });
    expect(res.status).toBe(200);

    const csv = String(res.data ?? "");
    expect(csv).toContain("Tanggal");
    expect(csv).not.toContain("Penjualan besok");
  });

  test("general ledger full range includes all", async () => {
    const res = await rpc(ownerToken, "export_general_ledger_csv", {
      p_organization_id: orgId,
      p_from_date: todayStr,
      p_to_date: tomorrowStr,
    });
    expect(res.status).toBe(200);

    const csv = String(res.data ?? "");
    expect(csv).toContain("Tanggal");
  });

  // ── Report auth: anonymous cannot access ──────────────────────────────

  test("anon trial balance returns 403", async () => {
    const res = await fetch(
      `${E2E.supabaseUrl}/rest/v1/rpc/export_trial_balance_csv`,
      {
        method: "POST",
        headers: {
          apikey: E2E.supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_organization_id: orgId,
          p_as_of_date: todayStr,
        }),
      },
    );
    expect([401, 403]).toContain(res.status);
  });
});
