import { describe, it, expect } from "vitest";
import {
  calculateDebitCredit,
  validateOpeningBalanceInput,
  type OpeningBalanceLine,
} from "./opening-balance.service";

describe("calculateDebitCredit", () => {
  it("asset with positive amount → debit", () => {
    const { debit, credit } = calculateDebitCredit("asset", 100000, "debit");
    expect(debit).toBe(100000);
    expect(credit).toBe(0);
  });

  it("asset with negative amount → credit", () => {
    const { debit, credit } = calculateDebitCredit("asset", -50000, "debit");
    expect(debit).toBe(0);
    expect(credit).toBe(50000);
  });

  it("liability with positive amount → credit", () => {
    const { debit, credit } = calculateDebitCredit("liability", 200000, "credit");
    expect(debit).toBe(0);
    expect(credit).toBe(200000);
  });

  it("equity with positive amount → credit", () => {
    const { debit, credit } = calculateDebitCredit("equity", 1000000, "credit");
    expect(debit).toBe(0);
    expect(credit).toBe(1000000);
  });

  it("expense with positive amount → debit", () => {
    const { debit, credit } = calculateDebitCredit("expense", 50000, "debit");
    expect(debit).toBe(50000);
    expect(credit).toBe(0);
  });

  it("revenue with positive amount → credit", () => {
    const { debit, credit } = calculateDebitCredit("revenue", 500000, "credit");
    expect(debit).toBe(0);
    expect(credit).toBe(500000);
  });
});

describe("validateOpeningBalanceInput", () => {
  it("accepts balanced input", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: "a1", accountType: "asset", normalBalance: "debit", amount: 100000 },
      { accountId: "a2", accountType: "equity", normalBalance: "credit", amount: 100000 },
    ];
    const result = validateOpeningBalanceInput(lines);
    expect(result.valid).toBe(true);
    expect(result.difference).toBe(0);
    expect(result.totalDebit).toBe(100000);
    expect(result.totalCredit).toBe(100000);
  });

  it("rejects unbalanced input", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: "a1", accountType: "asset", normalBalance: "debit", amount: 100000 },
      { accountId: "a2", accountType: "equity", normalBalance: "credit", amount: 50000 },
    ];
    const result = validateOpeningBalanceInput(lines);
    expect(result.valid).toBe(false);
    expect(result.difference).toBe(50000);
  });

  it("rejects empty input", () => {
    const result = validateOpeningBalanceInput([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("handles negative balance (credit balance on asset)", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: "cash", accountType: "asset", normalBalance: "debit", amount: 150000 },
      { accountId: "ar", accountType: "asset", normalBalance: "debit", amount: -70000 },
      { accountId: "ap", accountType: "liability", normalBalance: "credit", amount: 80000 },
    ];
    const result = validateOpeningBalanceInput(lines);
    // cash 150000 debit, AR -70000 → 0 debit + 70000 credit, AP 80000 credit
    // total: 150000 debit, 150000 credit
    expect(result.valid).toBe(true);
    expect(result.difference).toBe(0);
    expect(result.totalDebit).toBe(150000);
    expect(result.totalCredit).toBe(150000);
  });

  it("calculates totals correctly with mixed accounts", () => {
    const lines: OpeningBalanceLine[] = [
      { accountId: "cash", accountType: "asset", normalBalance: "debit", amount: 500000 },
      { accountId: "bank", accountType: "asset", normalBalance: "debit", amount: 1000000 },
      { accountId: "ap", accountType: "liability", normalBalance: "credit", amount: 300000 },
      { accountId: "capital", accountType: "equity", normalBalance: "credit", amount: 1200000 },
    ];
    const result = validateOpeningBalanceInput(lines);
    expect(result.totalDebit).toBe(1500000);
    expect(result.totalCredit).toBe(1500000);
    expect(result.valid).toBe(true);
  });
});
