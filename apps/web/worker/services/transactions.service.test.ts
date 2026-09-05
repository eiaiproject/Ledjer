import { describe, expect, it } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";
import {
  assertJournalBalanced,
  countTransactions,
  getTransaction,
  listTransactions,
  postTransaction,
  transactionDirection,
  transactionTypeLabel,
  voidTransaction,
} from "./transactions.service";
import { HttpError } from "../http/errors";
import type { FakeD1Database } from "../test/fake-d1";

const ORG_A = FIXTURE_IDS.orgs.a;
const OWNER_A = FIXTURE_IDS.users.ownerA;

function fresh(): ReturnType<typeof createSeedFixtures> {
  return createSeedFixtures();
}

describe("assertJournalBalanced", () => {
  it("accepts a balanced two-line journal", () => {
    expect(() =>
      assertJournalBalanced([
        { accountId: "cash", debitIdr: 100000, creditIdr: 0 },
        { accountId: "revenue", debitIdr: 0, creditIdr: 100000 },
      ]),
    ).not.toThrow();
  });

  it("rejects an unbalanced journal", () => {
    expect(() =>
      assertJournalBalanced([
        { accountId: "cash", debitIdr: 100000, creditIdr: 0 },
        { accountId: "revenue", debitIdr: 0, creditIdr: 90000 },
      ]),
    ).toThrowError(HttpError);
  });

  it("rejects a line with both debit and credit", () => {
    expect(() =>
      assertJournalBalanced([
        { accountId: "cash", debitIdr: 100000, creditIdr: 50000 },
        { accountId: "revenue", debitIdr: 0, creditIdr: 50000 },
      ]),
    ).toThrowError(HttpError);
  });
});

describe("transaction type helpers", () => {
  it("maps transaction types to direction", () => {
    expect(transactionDirection("cash_in")).toBe("in");
    expect(transactionDirection("owner_deposit")).toBe("in");
    expect(transactionDirection("cash_out")).toBe("out");
    expect(transactionDirection("owner_withdrawal")).toBe("out");
    expect(transactionDirection("transfer")).toBe("neutral");
  });

  it("labels transaction types in Indonesian", () => {
    expect(transactionTypeLabel("cash_in")).toBe("Uang Masuk");
    expect(transactionTypeLabel("cash_out")).toBe("Uang Keluar");
    expect(transactionTypeLabel("transfer")).toBe("Transfer");
    expect(transactionTypeLabel("owner_deposit")).toBe("Modal Masuk");
    expect(transactionTypeLabel("owner_withdrawal")).toBe("Pengambilan Pemilik");
  });
});

describe("postTransaction", () => {
  it("posts a cash_in transaction with a balanced journal", async () => {
    const { db } = fresh();
    const result = await postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
      transactionType: "cash_in",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.revenueA,
      amountIdr: 500000,
      description: "Penjualan tunai",
      idempotencyKey: "idem-test-cashin-0001",
    });

    expect(result.status).toBe("posted");
    expect(result.transaction_number).toMatch(/^TRX-\d{8}-[A-Z2-9]{4}$/);
    expect(result.journal_entry_id).toBeTruthy();

    const journalLineInserts = db.statements.filter((s) =>
      s.sql.includes("INSERT INTO journal_lines"),
    );
    expect(journalLineInserts).toHaveLength(2);
    const [debit, credit] = journalLineInserts;
    expect(debit.values[3]).toBe(FIXTURE_IDS.accounts.cashA);
    expect(debit.values[4]).toBe(500000);
    expect(debit.values[5]).toBe(0);
    expect(credit.values[3]).toBe(FIXTURE_IDS.accounts.revenueA);
    expect(credit.values[4]).toBe(0);
    expect(credit.values[5]).toBe(500000);
  });

  it("posts a cash_out transaction (debit expense, credit cash)", async () => {
    const { db } = fresh();
    await postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
      transactionType: "cash_out",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.expenseRentA,
      amountIdr: 250000,
      description: "Bayar sewa",
      idempotencyKey: "idem-test-cshout-0001",
    });

    const journalLineInserts = db.statements.filter((s) =>
      s.sql.includes("INSERT INTO journal_lines"),
    );
    const [debit, credit] = journalLineInserts;
    expect(debit.values[3]).toBe(FIXTURE_IDS.accounts.expenseRentA);
    expect(credit.values[3]).toBe(FIXTURE_IDS.accounts.cashA);
  });

  it("posts a transfer with destination debited and source credited", async () => {
    const { db } = fresh();
    await postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
      transactionType: "transfer",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.bankA,
      amountIdr: 250000,
      description: "Pindah ke bank",
      idempotencyKey: "idem-test-trsfr-0001",
    });

    const journalLineInserts = db.statements.filter((s) =>
      s.sql.includes("INSERT INTO journal_lines"),
    );
    const [debit, credit] = journalLineInserts;
    expect(debit.values[3]).toBe(FIXTURE_IDS.accounts.bankA);
    expect(credit.values[3]).toBe(FIXTURE_IDS.accounts.cashA);
  });

  it("is idempotent: replaying the same key returns the original transaction", async () => {
    const { db } = fresh();
    const input = {
      transactionType: "cash_out" as const,
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.expenseRentA,
      amountIdr: 100000,
      description: "Bayar listrik",
      idempotencyKey: "idem-test-replay-0001",
    };

    const first = await postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, input);
    const replay = await postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, input);

    expect(replay.transaction_id).toBe(first.transaction_id);
    expect(replay.replayed).toBe(true);
    expect(first.replayed).toBeUndefined();
  });

  it("rejects an invalid counter account class", async () => {
    const { db } = fresh();
    await expect(
      postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
        transactionType: "cash_in",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.equityA, // equity is not income
        amountIdr: 50000,
        description: "Salah akun",
        idempotencyKey: "idem-test-invalid-0001",
      }),
    ).rejects.toThrowError(HttpError);
  });

  it("rejects a transfer to the same account", async () => {
    const { db } = fresh();
    await expect(
      postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
        transactionType: "transfer",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.cashA,
        amountIdr: 50000,
        description: "Transfer ke sendiri",
        idempotencyKey: "idem-test-sameacct-0001",
      }),
    ).rejects.toThrowError(HttpError);
  });

  it("rejects a future transaction date", async () => {
    const { db } = fresh();
    const future = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-CA");
    await expect(
      postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
        transactionType: "cash_in",
        transactionDate: future,
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.revenueA,
        amountIdr: 50000,
        description: "Tanggal masa depan",
        idempotencyKey: "idem-test-future-0001",
      }),
    ).rejects.toThrowError(HttpError);
  });

  it("rejects a zero amount", async () => {
    const { db } = fresh();
    await expect(
      postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
        transactionType: "cash_in",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.revenueA,
        amountIdr: 0,
        description: "Nol rupiah",
        idempotencyKey: "idem-test-zero-0001",
      }),
    ).rejects.toThrowError(HttpError);
  });

  it("rejects a fractional amount instead of silently rounding it", async () => {
    const { db } = fresh();
    await expect(
      postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
        transactionType: "cash_in",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.revenueA,
        amountIdr: 1.5,
        description: "Rupiah pecahan",
        idempotencyKey: "idem-test-frac-0001",
      }),
    ).rejects.toThrowError(HttpError);

    // No journal may be written for the rejected amount.
    expect(db.statements.some((s) => s.sql.includes("INSERT INTO journal_lines"))).toBe(false);
  });

  it("rejects an amount above the IDR ceiling", async () => {
    const { db } = fresh();
    await expect(
      postTransaction(db as unknown as D1Database, ORG_A, OWNER_A, {
        transactionType: "cash_in",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.revenueA,
        amountIdr: 1_000_000_000_000,
        description: "Terlalu besar",
        idempotencyKey: "idem-test-huge-0001",
      }),
    ).rejects.toThrowError(HttpError);
  });

  it("turns a UNIQUE idempotency race into a replay instead of a 500", async () => {
    const { db } = fresh();
    const base = db as unknown as FakeD1Database;
    const input = {
      transactionType: "cash_in" as const,
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.revenueA,
      amountIdr: 123000,
      description: "Transaksi race",
      idempotencyKey: "idem-test-race-0001",
    };

    // Winner commits first (real insert path).
    const winner = await postTransaction(base as unknown as D1Database, ORG_A, OWNER_A, input);

    // Loser simulation: its pre-insert idempotency lookup MISSES (it read
    // before the winner committed) and its batch then hits the UNIQUE index.
    let lookupSuppressed = false;
    const racing = new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === "prepare") {
          return (sql: string) => {
            const statement = Reflect.get(target, "prepare").call(target, sql);
            if (!lookupSuppressed && typeof sql === "string" && sql.includes("idempotency_key")) {
              lookupSuppressed = true;
              return new Proxy(statement, {
                get(stTarget, stProp) {
                  if (stProp === "first") return async () => null;
                  return Reflect.get(stTarget, stProp);
                },
              });
            }
            return statement;
          };
        }
        if (prop === "batch") {
          return async () => {
            throw new Error("D1_ERROR: UNIQUE constraint failed: idx_transactions_org_idempotency");
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const loser = await postTransaction(racing as unknown as D1Database, ORG_A, OWNER_A, input);
    expect(loser.transaction_id).toBe(winner.transaction_id);
    expect(loser.replayed).toBe(true);
    expect(loser.status).toBe("posted");
  });
});

describe("listTransactions / getTransaction", () => {
  it("lists all posted and voided transactions for the org", async () => {
    const { db } = fresh();
    const transactions = await listTransactions(db as unknown as D1Database, ORG_A, {});
    const total = await countTransactions(db as unknown as D1Database, ORG_A, {});
    expect(total).toBe(6);
    expect(transactions).toHaveLength(6);
    expect(transactions[0].transaction_number).toMatch(/^TRX-/);
    expect(transactions.some((t) => t.status === "voided")).toBe(true);
  });

  it("filters by status", async () => {
    const { db } = fresh();
    const transactions = await listTransactions(db as unknown as D1Database, ORG_A, {
      status: "voided",
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].id).toBe(FIXTURE_IDS.transactions.voidedOutA);
  });

  it("filters by transaction type", async () => {
    const { db } = fresh();
    const transactions = await listTransactions(db as unknown as D1Database, ORG_A, {
      transactionType: "transfer",
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].transaction_type).toBe("transfer");
  });

  it("gets a single transaction with account names joined", async () => {
    const { db } = fresh();
    const txn = await getTransaction(
      db as unknown as D1Database,
      ORG_A,
      FIXTURE_IDS.transactions.cashInA,
    );
    expect(txn.description).toBe("Penjualan tunai");
    expect(txn.cash_bank_account).toBe("Kas");
    expect(txn.counter_account).toBe("Pendapatan Usaha");
  });

  it("throws not found for a transaction outside the org", async () => {
    const { db } = fresh();
    await expect(
      getTransaction(db as unknown as D1Database, ORG_A, FIXTURE_IDS.transactions.cashInB),
    ).rejects.toThrowError(HttpError);
  });
});

describe("voidTransaction", () => {
  it("voids a posted transaction and returns it as voided", async () => {
    const { db } = fresh();
    const txn = await voidTransaction(
      db as unknown as D1Database,
      ORG_A,
      OWNER_A,
      FIXTURE_IDS.transactions.cashOutA,
      { reason: "Salah nominal" },
    );

    expect(txn.status).toBe("voided");
    expect(txn.void_reason).toBe("Salah nominal");
  });

  it("rejects voiding an already-voided transaction", async () => {
    const { db } = fresh();
    await expect(
      voidTransaction(
        db as unknown as D1Database,
        ORG_A,
        OWNER_A,
        FIXTURE_IDS.transactions.voidedOutA,
        {},
      ),
    ).rejects.toThrowError(HttpError);
  });

  it("rejects voiding a transaction from another org", async () => {
    const { db } = fresh();
    await expect(
      voidTransaction(
        db as unknown as D1Database,
        ORG_A,
        OWNER_A,
        FIXTURE_IDS.transactions.cashInB,
        {},
      ),
    ).rejects.toThrowError(HttpError);
  });
});