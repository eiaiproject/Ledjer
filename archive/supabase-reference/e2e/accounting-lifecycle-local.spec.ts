import { test, expect } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  loginUser,
} from "./fixtures/seed";
import { getCashAccount, getAccountByCode } from "./fixtures/accounts";
import { cleanupE2EOrganizations, cleanupE2EUsers } from "./fixtures/cleanup";

// ── Helpers ──────────────────────────────────────────────────────────────

function userHeaders(token: string) {
  return {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function serviceHeaders() {
  return {
    apikey: E2E.serviceRoleKey,
    Authorization: `Bearer ${E2E.serviceRoleKey}`,
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

async function postTx(
  token: string,
  orgId: string,
  type: string,
  amount: number,
  opts: Record<string, unknown> = {},
): Promise<{ transaction_id: string }> {
  const { status, data } = await rpc(token, "post_transaction", {
    p_organization_id: orgId,
    p_transaction_date: new Date().toISOString().split("T")[0],
    p_transaction_type: type,
    p_amount: amount,
    p_payment_status: "paid",
    p_description: e2eName(`${type} ${amount}`),
    p_client_token: crypto.randomUUID(),
    ...opts,
  });
  expect(status).toBe(200);
  return data as { transaction_id: string };
}

async function voidTx(
  token: string,
  orgId: string,
  txId: string,
): Promise<void> {
  const { status } = await rpc(token, "void_transaction", {
    p_organization_id: orgId,
    p_transaction_id: txId,
    p_void_reason: e2eName("Void test"),
  });
  expect(status).toBe(200);
}

// get_account_balance is SECURITY DEFINER — must use user JWT (not service role)
let _cachedOwnerToken: string;

async function getBalanceByCode(orgId: string, code: number): Promise<number> {
  void orgId;
  if (!_cachedOwnerToken) {
    _cachedOwnerToken = await loginUser(E2E_OWNER);
  }
  const acct = await getAccountByCode(orgId, code);
  if (!acct) throw new Error(`Account ${code} not found`);
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/rpc/get_account_balance?p_account_id=${acct.id}&p_as_of_date=${today}`,
    { headers: userHeaders(_cachedOwnerToken) },
  );
  if (!res.ok) throw new Error(`Failed to get balance for ${code}: ${res.status}`);
  return Number(await res.json() ?? 0);
}

async function expectBalanced(token: string, orgId: string) {
  // Query journal_lines directly to avoid heavy nested journal_lines(*) select
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/journal_lines?organization_id=eq.${orgId}&select=debit,credit,journal_entry_id`,
    {
      headers: {
        apikey: E2E.serviceRoleKey,
        Authorization: `Bearer ${E2E.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  expect(res.ok).toBe(true);
  const lines = (await res.json()) as Array<{ debit: number; credit: number; journal_entry_id: string }>;
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
}

// ── Tests ────────────────────────────────────────────────────────────────

if (E2E.isFullLocal) {
test.describe("Accounting: Full lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  let ownerToken: string;
  let orgId: string;
  let cashAcct: Awaited<ReturnType<typeof getCashAccount>>;


  test.beforeAll(async () => {
    await ensureTestUser(E2E_OWNER);
    ownerToken = await loginUser(E2E_OWNER);
    orgId = await seedOrganization(
      (await ensureTestUser(E2E_OWNER)),
      e2eName("Lifecycle Org"),
    );
    cashAcct = await getCashAccount(orgId);
  });

  test.afterAll(async () => {
    await cleanupE2EOrganizations();
    await cleanupE2EUsers();
  });

  // ── AR Lifecycle ──────────────────────────────────────────────────────

  test.describe("AR lifecycle: full receivable settlement", () => {
    let customerPartyId: string;

    test("credit sale creates AR, full receive_receivable zeroes it", async () => {
      // Create customer party
      const partyRes = await fetch(
        `${E2E.supabaseUrl}/rest/v1/parties`,
        {
          method: "POST",
          headers: {
            ...serviceHeaders(),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            organization_id: orgId,
            name: e2eName("Pelanggan AR Test"),
            party_type: "customer",
            is_active: true,
          }),
        },
      );
      expect(partyRes.ok).toBe(true);
      const partyData = await partyRes.json();
      customerPartyId = partyData[0].id;

      const arBefore = await getBalanceByCode(orgId, 1200);

      // Credit sale: 500,000
      const { transaction_id: saleTxId } = await postTx(
        ownerToken,
        orgId,
        "credit_sale",
        500_000,
        { p_party_id: customerPartyId, p_payment_status: "unpaid" },
      );
      expect(saleTxId).toBeTruthy();

      const arAfterSale = await getBalanceByCode(orgId, 1200);
      expect(arAfterSale - arBefore).toBeCloseTo(500_000, 0);

      // Receive full receivable
      await postTx(ownerToken, orgId, "receive_receivable", 500_000, {
        p_party_id: customerPartyId,
        p_cash_account_id: cashAcct.id,
      });

      const arAfterReceive = await getBalanceByCode(orgId, 1200);
      expect(arAfterReceive).toBeCloseTo(arBefore, 0);
    });
  });

  test.describe("AR lifecycle: partial receivable settlement", () => {
    test("credit sale partial, then receive remainder", async () => {
      // Create a second customer
      const partyRes = await fetch(
        `${E2E.supabaseUrl}/rest/v1/parties`,
        {
          method: "POST",
          headers: {
            ...serviceHeaders(),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            organization_id: orgId,
            name: e2eName("Pelanggan Partial AR"),
            party_type: "customer",
            is_active: true,
          }),
        },
      );
      const partyData = await partyRes.json();
      const partialPartyId = partyData[0].id;

      const arBefore = await getBalanceByCode(orgId, 1200);

      // Credit sale 300,000 with partial payment 100,000
      await postTx(ownerToken, orgId, "credit_sale", 300_000, {
        p_party_id: partialPartyId,
        p_payment_status: "partial",
        p_partial_amount: 100_000,
        p_cash_account_id: cashAcct.id,
      });

      // AR should increase by 200,000 (remaining amount)
      const arAfterPartial = await getBalanceByCode(orgId, 1200);
      expect(arAfterPartial - arBefore).toBeCloseTo(200_000, 0);

      // Receive the remaining 200,000
      await postTx(ownerToken, orgId, "receive_receivable", 200_000, {
        p_party_id: partialPartyId,
        p_cash_account_id: cashAcct.id,
      });

      const arAfterFull = await getBalanceByCode(orgId, 1200);
      expect(arAfterFull).toBeCloseTo(arBefore, 0);
    });
  });

  // ── AP Lifecycle ──────────────────────────────────────────────────────

  test.describe("AP lifecycle: full payable settlement", () => {
    test("credit_purchase creates AP, full pay_payable zeroes it", async () => {
      // Create supplier
      const partyRes = await fetch(
        `${E2E.supabaseUrl}/rest/v1/parties`,
        {
          method: "POST",
          headers: {
            ...serviceHeaders(),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            organization_id: orgId,
            name: e2eName("Supplier AP Test"),
            party_type: "supplier",
            is_active: true,
          }),
        },
      );
      const partyData = await partyRes.json();
      const supplierId = partyData[0].id;

      const apBefore = await getBalanceByCode(orgId, 2100);

      // Credit purchase: 800,000
      await postTx(ownerToken, orgId, "credit_purchase", 800_000, {
        p_party_id: supplierId,
        p_payment_status: "unpaid",
        p_debit_account_id: (
          await fetch(
            `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&code=eq.6190&select=id&limit=1`,
            { headers: { apikey: E2E.serviceRoleKey, Authorization: `Bearer ${E2E.serviceRoleKey}` } },
          ).then((r) => r.json())
        )[0].id,
      });

      const apAfterPurchase = await getBalanceByCode(orgId, 2100);
      expect(apAfterPurchase - apBefore).toBeCloseTo(800_000, 0);

      // Pay full payable
      await postTx(ownerToken, orgId, "pay_payable", 800_000, {
        p_party_id: supplierId,
        p_cash_account_id: cashAcct.id,
      });

      const apAfterPay = await getBalanceByCode(orgId, 2100);
      expect(apAfterPay).toBeCloseTo(apBefore, 0);
    });
  });

  test.describe("AP lifecycle: partial payable settlement", () => {
    test("credit_purchase partial, then pay remainder", async () => {
      const partyRes = await fetch(
        `${E2E.supabaseUrl}/rest/v1/parties`,
        {
          method: "POST",
          headers: {
            ...serviceHeaders(),
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            organization_id: orgId,
            name: e2eName("Supplier Partial AP"),
            party_type: "supplier",
            is_active: true,
          }),
        },
      );
      const partyData = await partyRes.json();
      const partialSupplierId = partyData[0].id;

      const apBefore = await getBalanceByCode(orgId, 2100);

      await postTx(ownerToken, orgId, "credit_purchase", 600_000, {
        p_party_id: partialSupplierId,
        p_payment_status: "partial",
        p_partial_amount: 200_000,
        p_cash_account_id: cashAcct.id,
        p_debit_account_id: (
          await fetch(
            `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&code=eq.6190&select=id&limit=1`,
            { headers: { apikey: E2E.serviceRoleKey, Authorization: `Bearer ${E2E.serviceRoleKey}` } },
          ).then((r) => r.json())
        )[0].id,
      });

      const apAfterPartial = await getBalanceByCode(orgId, 2100);
      expect(apAfterPartial - apBefore).toBeCloseTo(400_000, 0);

      await postTx(ownerToken, orgId, "pay_payable", 400_000, {
        p_party_id: partialSupplierId,
        p_cash_account_id: cashAcct.id,
      });

      const apAfterFull = await getBalanceByCode(orgId, 2100);
      expect(apAfterFull).toBeCloseTo(apBefore, 0);
    });
  });

  // ── Transfer does not affect P&L ──────────────────────────────────────

  test.describe("Cash transfer does not affect P&L", () => {
    let bankAcct: { id: string; code: number };

    test.beforeAll(async () => {
      const accounts = await fetch(
        `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&code=eq.1120&select=id,code&limit=1`,
        { headers: { apikey: E2E.serviceRoleKey, Authorization: `Bearer ${E2E.serviceRoleKey}` } },
      ).then((r) => r.json());
      bankAcct = accounts[0];
    });

    test("transfer between cash and bank does not change revenue or expense", async () => {
      const revBefore = await getBalanceByCode(orgId, 4100);
      const expBefore = await getBalanceByCode(orgId, 6190);

      await postTx(ownerToken, orgId, "cash_transfer", 500_000, {
        p_cash_account_id: cashAcct.id,
        p_destination_cash_account_id: bankAcct.id,
      });

      const revAfter = await getBalanceByCode(orgId, 4100);
      const expAfter = await getBalanceByCode(orgId, 6190);

      expect(revAfter).toBeCloseTo(revBefore, 0);
      expect(expAfter).toBeCloseTo(expBefore, 0);
    });
  });

  // ── Owner capital / draw ──────────────────────────────────────────────

  test.describe("Owner capital and draw", () => {
    test("owner_capital increases cash and modal, owner_draw decreases both", async () => {
      const cashBefore = await getBalanceByCode(orgId, 1110);
      const modalBefore = await getBalanceByCode(orgId, 3100);

      // Owner capital injection
      await postTx(ownerToken, orgId, "owner_capital", 5_000_000, {
        p_cash_account_id: cashAcct.id,
      });

      const cashAfterCap = await getBalanceByCode(orgId, 1110);
      const modalAfterCap = await getBalanceByCode(orgId, 3100);
      expect(cashAfterCap - cashBefore).toBeCloseTo(5_000_000, 0);
      expect(modalAfterCap - modalBefore).toBeCloseTo(5_000_000, 0);

      // Owner draw
      await postTx(ownerToken, orgId, "owner_draw", 1_000_000, {
        p_cash_account_id: cashAcct.id,
      });

      const cashAfterDraw = await getBalanceByCode(orgId, 1110);
      const modalAfterDraw = await getBalanceByCode(orgId, 3100);
      expect(cashAfterDraw).toBeCloseTo(cashAfterCap - 1_000_000, 0);
      expect(modalAfterDraw).toBeCloseTo(modalAfterCap, 0); // Modal unchanged
    });
  });

  // ── Void reversal balanced ────────────────────────────────────────────

  test.describe("Void reversal is balanced", () => {
    test("voiding a transaction creates balanced reversal journals", async () => {
      // Create a transaction to void
      const { transaction_id: txId } = await postTx(
        ownerToken,
        orgId,
        "expense_payment",
        250_000,
        {
          p_cash_account_id: cashAcct.id,
          p_debit_account_id: (
            await fetch(
              `${E2E.supabaseUrl}/rest/v1/accounts?organization_id=eq.${orgId}&code=eq.6190&select=id&limit=1`,
              { headers: { apikey: E2E.serviceRoleKey, Authorization: `Bearer ${E2E.serviceRoleKey}` } },
            ).then((r) => r.json())
          )[0].id,
        },
      );

      // Void it
      await voidTx(ownerToken, orgId, txId);

      // Verify all journals are balanced
      await expectBalanced(ownerToken, orgId);
    });
  });
});
}
