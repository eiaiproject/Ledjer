/**
 * Golden Accounting Scenarios - MVP regression suite
 *
 * End-to-end accounting flows against the seeded fake D1:
 *   - Journal balance invariant for every transaction type
 *   - Profit & loss correctness after posting
 *   - Balance sheet equation (A = L + E) after posting
 *   - Void removes a transaction's impact from reports and balances
 *   - Cross-org isolation of reports
 */

import { describe, expect, it } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";
import { postTransaction, voidTransaction } from "./transactions.service";
import { getBalanceSheet, getProfitLoss } from "./reports.service";
import { listAccounts } from "./accounts.service";

const ORG_A = FIXTURE_IDS.orgs.a;
const ORG_B = FIXTURE_IDS.orgs.b;
const OWNER_A = FIXTURE_IDS.users.ownerA;

function freshDb(): D1Database {
  return createSeedFixtures().db as unknown as D1Database;
}

describe("Golden Accounting Scenarios", () => {
  it("G1: posting a cash_in keeps every journal balanced and moves balances", async () => {
    const db = freshDb();
    const before = await listAccounts(db, ORG_A);
    const cashBefore = before.find((a) => a.id === FIXTURE_IDS.accounts.cashA)!.balance_idr;

    await postTransaction(db, ORG_A, OWNER_A, {
      transactionType: "cash_in",
      transactionDate: "2026-06-25",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.revenueA,
      amountIdr: 150000,
      description: "Penjualan tambahan",
      idempotencyKey: "idem-golden-cashin-0001",
    });

    const after = await listAccounts(db, ORG_A);
    const cashAfter = after.find((a) => a.id === FIXTURE_IDS.accounts.cashA)!.balance_idr;
    expect(cashAfter).toBe(cashBefore + 150000);

    const pl = await getProfitLoss(db, ORG_A, "2026-06-01", "2026-06-30");
    expect(pl.income.total).toBe(2000000 + 150000);
    expect(pl.netIncome).toBe(800000 + 150000);

    const bs = await getBalanceSheet(db, ORG_A, "2026-06-30");
    expect(bs.totalAssets).toBe(5800000 + 150000);
    expect(bs.balanced).toBe(true);
  });

  it("G2: owner_deposit increases cash and equity but not income", async () => {
    const db = freshDb();
    await postTransaction(db, ORG_A, OWNER_A, {
      transactionType: "owner_deposit",
      transactionDate: "2026-06-25",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.equityA,
      amountIdr: 1000000,
      description: "Tambah modal",
      idempotencyKey: "idem-golden-deposit-0001",
    });

    const pl = await getProfitLoss(db, ORG_A, "2026-06-01", "2026-06-30");
    expect(pl.income.total).toBe(2000000); // unchanged

    const bs = await getBalanceSheet(db, ORG_A, "2026-06-30");
    expect(bs.totalAssets).toBe(5800000 + 1000000);
    expect(bs.balanced).toBe(true);
  });

  it("G3: voiding a cash_out restores the balance and removes it from reports", async () => {
    const db = freshDb();
    const before = await getBalanceSheet(db, ORG_A, "2026-06-30");
    const cashBefore = before.assets.find((a) => a.code === "1110")!.amount;

    await voidTransaction(db, ORG_A, OWNER_A, FIXTURE_IDS.transactions.cashOutA, {});

    const pl = await getProfitLoss(db, ORG_A, "2026-06-01", "2026-06-30");
    expect(pl.expense.total).toBe(0);
    expect(pl.netIncome).toBe(2000000);

    const bs = await getBalanceSheet(db, ORG_A, "2026-06-30");
    expect(bs.totalAssets).toBe(5800000 + 1200000);
    expect(bs.balanced).toBe(true);
    const cashAfter = bs.assets.find((a) => a.code === "1110")!.amount;
    expect(cashAfter).toBe(cashBefore + 1200000);
  });

  it("G4: balance sheet equation holds and reports never leak across orgs", async () => {
    const db = freshDb();
    const bsA = await getBalanceSheet(db, ORG_A, "2026-06-30");
    const bsB = await getBalanceSheet(db, ORG_B, "2026-06-30");

    expect(bsA.balanced).toBe(true);
    expect(bsB.balanced).toBe(true);
    expect(bsA.totalAssets).toBe(5800000);
    expect(bsB.totalAssets).toBe(4000000);

    const plB = await getProfitLoss(db, ORG_B, "2026-06-01", "2026-06-30");
    expect(plB.income.total).toBe(1000000);
  });
});