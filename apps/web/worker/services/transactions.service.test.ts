import { describe, expect, it } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import { assertJournalBalanced, assertPeriodOpen, calculateSettlementRemaining } from "./transactions.service";

describe("journal invariants", () => {
  it("accepts positive balanced debit and credit totals", () => {
    expect(() => assertJournalBalanced([
      {
        accountId: "cash",
        debitMinor: 100_000,
        creditMinor: 0,
        description: "Cash sale",
      },
      {
        accountId: "revenue",
        debitMinor: 0,
        creditMinor: 100_000,
        description: "Cash sale",
      },
    ])).not.toThrow();
  });

  it("rejects unbalanced journals", () => {
    expect(() => assertJournalBalanced([
      {
        accountId: "cash",
        debitMinor: 100_000,
        creditMinor: 0,
        description: "Broken",
      },
      {
        accountId: "revenue",
        debitMinor: 0,
        creditMinor: 90_000,
        description: "Broken",
      },
    ])).toThrow(expect.objectContaining({ code: "journal_unbalanced" }));
  });

  it("rejects zero-value journals", () => {
    expect(() => assertJournalBalanced([])).toThrow(
      expect.objectContaining({ code: "journal_unbalanced" }),
    );
  });
});

describe("period lock guard", () => {
  it("rejects posting inside a locked accounting period", async () => {
    const db = new FakeD1Database({
      first: () => ({
        id: "lock-1",
        locked_through_date: "2026-07-31",
      }),
    }) as unknown as D1Database;

    await expect(assertPeriodOpen(db, "org-1", "2026-07-07")).rejects.toMatchObject({
      code: "period_locked",
      status: 409,
    });
  });

  it("allows posting when no lock covers the date", async () => {
    const db = new FakeD1Database() as unknown as D1Database;

    await expect(assertPeriodOpen(db, "org-1", "2026-08-01")).resolves.toBeUndefined();
  });
});

describe("calculateSettlementRemaining", () => {
  const linesForCreditSalePartial30k = [
    {
      id: "jl1", journal_entry_id: "je1", account_id: "1100",
      debit_minor: 30_000, credit_minor: 0, description: "Partial payment", line_order: 1,
    },
    {
      id: "jl2", journal_entry_id: "je1", account_id: "1200",
      debit_minor: 70_000, credit_minor: 0, description: "AR remaining", line_order: 2,
    },
    {
      id: "jl3", journal_entry_id: "je1", account_id: "4000",
      debit_minor: 0, credit_minor: 100_000, description: "Revenue", line_order: 3,
    },
  ];

  const linesForCreditPurchasePartial30k = [
    {
      id: "jl1", journal_entry_id: "je1", account_id: "1100",
      debit_minor: 0, credit_minor: 30_000, description: "Partial payment", line_order: 1,
    },
    {
      id: "jl2", journal_entry_id: "je1", account_id: "2100",
      debit_minor: 0, credit_minor: 70_000, description: "AP remaining", line_order: 2,
    },
    {
      id: "jl3", journal_entry_id: "je1", account_id: "5000",
      debit_minor: 100_000, credit_minor: 0, description: "Inventory/Expense", line_order: 3,
    },
  ];

  function makeDb(lines: typeof linesForCreditSalePartial30k) {
    return new FakeD1Database({
      all: (sql) => {
        if (sql.includes("FROM journal_lines jl")) return lines;
        return [];
      },
    }) as unknown as D1Database;
  }

  it("returns 70k remaining when settling 100k credit_sale with 30k already paid via same cash account", async () => {
    const db = makeDb(linesForCreditSalePartial30k);
    const remaining = await calculateSettlementRemaining(db, "org-1", "tx-1", "1100", 100_000, true, "1100");
    expect(remaining).toBe(70_000);
  });

  it("returns 70k remaining when settling 100k credit_sale with 30k already paid via different cash account", async () => {
    const db = makeDb(linesForCreditSalePartial30k);
    const remaining = await calculateSettlementRemaining(db, "org-1", "tx-1", "1101", 100_000, true, "1100");
    expect(remaining).toBe(70_000);
  });

  it("returns 70k remaining when settling 100k credit_purchase with 30k already paid via same cash account", async () => {
    const db = makeDb(linesForCreditPurchasePartial30k);
    const remaining = await calculateSettlementRemaining(db, "org-1", "tx-1", "1100", 100_000, false, "1100");
    expect(remaining).toBe(70_000);
  });

  it("returns 70k remaining when settling 100k credit_purchase with 30k already paid via different cash account", async () => {
    const db = makeDb(linesForCreditPurchasePartial30k);
    const remaining = await calculateSettlementRemaining(db, "org-1", "tx-1", "1101", 100_000, false, "1100");
    expect(remaining).toBe(70_000);
  });

  it("throws already_fully_paid when attempting to settle an already fully paid transaction", async () => {
    const fullyPaidLines = [
      {
        id: "jl1", journal_entry_id: "je1", account_id: "1100",
        debit_minor: 100_000, credit_minor: 0, description: "Full payment", line_order: 1,
      },
      {
        id: "jl2", journal_entry_id: "je1", account_id: "1200",
        debit_minor: 0, credit_minor: 100_000, description: "AR", line_order: 2,
      },
    ];
    const db = makeDb(fullyPaidLines);
    await expect(
      calculateSettlementRemaining(db, "org-1", "tx-1", "1100", 100_000, true, "1100"),
    ).rejects.toMatchObject({ code: "already_fully_paid" });
  });

  it("throws over_settlement when settlement amount exceeds remaining", async () => {
    const oversettleLines = [
      {
        id: "jl1", journal_entry_id: "je1", account_id: "1100",
        debit_minor: 0, credit_minor: 20_000, description: "Partial payment", line_order: 1,
      },
      {
        id: "jl2", journal_entry_id: "je1", account_id: "2100",
        debit_minor: 0, credit_minor: 80_000, description: "AP", line_order: 2,
      },
      {
        id: "jl3", journal_entry_id: "je1", account_id: "5000",
        debit_minor: 100_000, credit_minor: 0, description: "Inventory", line_order: 3,
      },
    ];
    const db = makeDb(oversettleLines);
    // originalAmountMinor=50k but 20k already paid → remaining=30k
    // Trying to settle for 50k would be over_settlement, but function only gets originalAmount
    // remaining = 50k - 20k = 30k, no error (still positive)
    // To trigger over_settlement, need originalAmount < what's been paid
    // Use originalAmountMinor=10k with 20k already paid → remaining = -10k → over_settlement
    await expect(
      calculateSettlementRemaining(db, "org-1", "tx-1", "1100", 10_000, false, "1100"),
    ).rejects.toMatchObject({ code: "over_settlement" });
  });
});
