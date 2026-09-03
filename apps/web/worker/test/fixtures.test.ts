import { describe, it, expect } from "vitest";
import { createSeedFixtures, FIXTURE_IDS, INVALID_DATA } from "./fixtures";

describe("Seed Fixtures", () => {
  it("creates three organizations with different IDs", () => {
    const ids = [FIXTURE_IDS.orgs.a, FIXTURE_IDS.orgs.b, FIXTURE_IDS.orgs.empty];
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });

  it("createSeedFixtures returns db and session tokens", () => {
    const result = createSeedFixtures();
    expect(result.db).not.toBeNull();
    expect(result.tokens.ownerA).toBeTypeOf("string");
    expect(result.tokens.ownerA.length).toBeGreaterThan(0);
    expect(result.tokens.ownerB).toBeTypeOf("string");
    expect(result.tokens.ownerB.length).toBeGreaterThan(0);
    expect(result.tokens.ownerB).not.toBe(result.tokens.ownerA);
    expect(result.tokens.ownerEmpty).toBeTypeOf("string");
  });

  it("all fixture IDs are unique across categories", () => {
    const allIds = Object.values(FIXTURE_IDS).flatMap((cat) =>
      Object.values(cat as Record<string, string>),
    );
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("provides the MVP cash/bank/equity/income/expense accounts", () => {
    const accts = FIXTURE_IDS.accounts;
    const required = [
      "cashA", "bankA", "equityA", "drawA",
      "revenueA", "otherRevenueA", "expenseSalaryA", "expenseRentA",
      "cashB", "equityB", "revenueB", "expenseB",
    ];
    for (const key of required) {
      expect(accts[key as keyof typeof accts]).toBeTypeOf("string");
    }
  });

  it("provides posted transactions for org A and org B", () => {
    expect(FIXTURE_IDS.transactions.depositA).toBeTypeOf("string");
    expect(FIXTURE_IDS.transactions.cashInA).toBeTypeOf("string");
    expect(FIXTURE_IDS.transactions.cashOutA).toBeTypeOf("string");
    expect(FIXTURE_IDS.transactions.transferA).toBeTypeOf("string");
    expect(FIXTURE_IDS.transactions.cashInB).toBeTypeOf("string");
    expect(FIXTURE_IDS.transactions.voidedOutA).toBeTypeOf("string");
  });

  it("INVALID_DATA provides an unbalanced journal fixture", () => {
    const { unbalancedJournal } = INVALID_DATA;
    const totalDebit = unbalancedJournal.lines.reduce((s, l) => s + l.debitIdr, 0);
    const totalCredit = unbalancedJournal.lines.reduce((s, l) => s + l.creditIdr, 0);
    expect(totalDebit).not.toBe(totalCredit);
  });

  it("INVALID_DATA provides a negative amount fixture", () => {
    expect(INVALID_DATA.negativeAmount.amountIdr).toBeLessThan(0);
  });
});