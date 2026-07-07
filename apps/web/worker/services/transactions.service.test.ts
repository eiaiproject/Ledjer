import { describe, expect, it } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import { assertJournalBalanced, assertPeriodOpen } from "./transactions.service";

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
