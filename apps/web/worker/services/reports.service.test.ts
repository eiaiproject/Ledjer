import { describe, expect, it } from "vitest";
import { assertTrialBalanceBalanced, type TrialBalanceRow } from "./reports.service";

function row(overrides: Partial<TrialBalanceRow>): TrialBalanceRow {
  return {
    account_id: "account",
    account_code: 1000,
    account_name: "Account",
    account_type: "asset",
    normal_balance: "debit",
    debit_total: 0,
    credit_total: 0,
    ending_debit: 0,
    ending_credit: 0,
    ...overrides,
  };
}

describe("report invariants", () => {
  it("detects a balanced trial balance", () => {
    expect(assertTrialBalanceBalanced([
      row({ account_code: 1110, ending_debit: 100_000 }),
      row({ account_code: 4100, account_type: "revenue", normal_balance: "credit", ending_credit: 100_000 }),
    ])).toBe(true);
  });

  it("detects an unbalanced trial balance", () => {
    expect(assertTrialBalanceBalanced([
      row({ account_code: 1110, ending_debit: 100_000 }),
      row({ account_code: 4100, account_type: "revenue", normal_balance: "credit", ending_credit: 90_000 }),
    ])).toBe(false);
  });
});
