/**
 * Repository integration tests — real SQLite-WASM, no mocks.
 *
 * Tests the full read/write cycle through the repository layer.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Database } from "@sqlite.org/sqlite-wasm";
import { applyLocalSchema } from "../local-schema";
import {
  getAllAccounts,
  getActiveAccounts,
  getAccountById,
  createAccountLocal,
  patchAccountLocal,
} from "./accounts.repo";
import {
  getAllProducts,
  createProductLocal,
  patchProductLocal,
} from "./products.repo";
import {
  getAllParties,
  createPartyLocal,
} from "./parties.repo";
import {
  getStockMovementsForTransactions,
  getTransactions,
  postTransactionLocal,
  voidTransactionLocal,
} from "./transactions.repo";
import {
  getPendingOutbox,
  countPendingOutbox,
  markOutboxSynced,
} from "./outbox.repo";

let db: Database;
const USER = "test-user-1";

beforeEach(async () => {
  const sqlite3 = await sqlite3InitModule();
  db = new sqlite3.oo1.DB(":memory:", "ct");
  applyLocalSchema(db);

  // Seed user
  db.exec(`INSERT INTO users (id, email, full_name, business_name, status, created_at, updated_at)
           VALUES ('${USER}', 'test@test.com', 'Test User', 'Test Book', 'active', ${Date.now()}, ${Date.now()})`);
});

afterEach(() => {
  db.close();
});

/* ================================================================== */
/*  Accounts                                                           */
/* ================================================================== */

describe("Accounts repository", () => {
  it("creates and reads account", () => {
    const acct = createAccountLocal(db, USER, {
      code: "1110",
      name: "Kas",
      accountClass: "asset",
      accountSubtype: "cash",
    });

    expect(acct.id).toBeDefined();
    expect(acct.code).toBe("1110");
    expect(acct.name).toBe("Kas");

    const found = getAccountById(db, acct.id);
    expect(found).not.toBeNull();
    expect(found!.code).toBe("1110");
  });

  it("lists all accounts", () => {
    createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset" });
    createAccountLocal(db, USER, { code: "4110", name: "Pendapatan", accountClass: "income" });

    const all = getAllAccounts(db, USER);
    expect(all.length).toBe(2);
    expect(all[0].code).toBe("1110"); // sorted by code
    expect(all[1].code).toBe("4110");
  });

  it("lists only active accounts", () => {
    const acct = createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset" });
    createAccountLocal(db, USER, { code: "4110", name: "Pendapatan", accountClass: "income" });

    patchAccountLocal(db, acct.id, { isActive: false });

    const active = getActiveAccounts(db, USER);
    expect(active.length).toBe(1);
    expect(active[0].code).toBe("4110");
  });

  it("patches account name", () => {
    const acct = createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset" });
    patchAccountLocal(db, acct.id, { name: "Kas Besar" });

    const found = getAccountById(db, acct.id);
    expect(found!.name).toBe("Kas Besar");
  });

  it("appends outbox on create", () => {
    createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset" });

    const pending = countPendingOutbox(db, USER);
    expect(pending).toBe(1);
  });

  it("appends outbox on patch", () => {
    const acct = createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset" });
    patchAccountLocal(db, acct.id, { name: "Kas Besar" });

    const pending = countPendingOutbox(db, USER);
    expect(pending).toBe(2); // 1 create + 1 update
  });
});

/* ================================================================== */
/*  Products                                                           */
/* ================================================================== */

describe("Products repository", () => {
  it("creates and reads product", () => {
    const prod = createProductLocal(db, USER, {
      code: "P001",
      name: "Widget",
      unit: "pcs",
      sellingPriceIdr: 100_000,
    });

    expect(prod.id).toBeDefined();
    expect(prod.code).toBe("P001");
    expect(prod.current_stock_milli).toBe(0);

    const all = getAllProducts(db, USER);
    expect(all.length).toBe(1);
    expect(all[0].name).toBe("Widget");
  });

  it("patches product price", () => {
    const prod = createProductLocal(db, USER, { code: "P001", name: "Widget" });
    patchProductLocal(db, prod.id, { sellingPriceIdr: 150_000 });

    const all = getAllProducts(db, USER);
    expect(all[0].selling_price_idr).toBe(150_000);
  });
});

/* ================================================================== */
/*  Parties                                                            */
/* ================================================================== */

describe("Parties repository", () => {
  it("creates and reads party", () => {
    const party = createPartyLocal(db, USER, {
      name: "PT Maju",
      partyType: "customer",
      contact: "08123456789",
    });

    expect(party.id).toBeDefined();
    expect(party.name).toBe("PT Maju");
    expect(party.party_type).toBe("customer");

    const all = getAllParties(db, USER);
    expect(all.length).toBe(1);
  });
});

/* ================================================================== */
/*  Transactions                                                       */
/* ================================================================== */

describe("Transactions repository", () => {
  // Create accounts for transaction tests
  let cashId: string;
  let revenueId: string;
  let expenseId: string;

  beforeEach(() => {
    const cash = createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset", accountSubtype: "cash" });
    const revenue = createAccountLocal(db, USER, { code: "4110", name: "Pendapatan", accountClass: "income" });
    const expense = createAccountLocal(db, USER, { code: "6110", name: "Beban Gaji", accountClass: "expense" });
    cashId = cash.id;
    revenueId = revenue.id;
    expenseId = expense.id;
  });

  it("posts cash_in transaction", () => {
    const tx = postTransactionLocal(db, USER, {
      transactionType: "cash_in",
      transactionDate: "2025-06-15",
      cashAccountId: cashId,
      counterAccountId: revenueId,
      amountIdr: 500_000,
    });

    expect(tx.id).toBeDefined();
    expect(tx.transaction_type).toBe("cash_in");
    expect(tx.amount_idr).toBe(500_000);
    expect(tx.status).toBe("posted");
  });

  it("posts cash_out transaction", () => {
    const tx = postTransactionLocal(db, USER, {
      transactionType: "cash_out",
      transactionDate: "2025-06-15",
      cashAccountId: cashId,
      counterAccountId: expenseId,
      amountIdr: 200_000,
    });

    expect(tx.transaction_type).toBe("cash_out");
    expect(tx.amount_idr).toBe(200_000);
  });

  it("lists transactions", () => {
    postTransactionLocal(db, USER, {
      transactionType: "cash_in",
      transactionDate: "2025-06-15",
      cashAccountId: cashId,
      counterAccountId: revenueId,
      amountIdr: 500_000,
    });

    postTransactionLocal(db, USER, {
      transactionType: "cash_out",
      transactionDate: "2025-06-16",
      cashAccountId: cashId,
      counterAccountId: expenseId,
      amountIdr: 100_000,
    });

    const txs = getTransactions(db, USER);
    expect(txs.length).toBe(2);
    // Sorted by date DESC
    expect(txs[0].transaction_date).toBe("2025-06-16");
    expect(txs[1].transaction_date).toBe("2025-06-15");
  });

  it("filters by date range", () => {
    postTransactionLocal(db, USER, {
      transactionType: "cash_in",
      transactionDate: "2025-06-15",
      cashAccountId: cashId,
      counterAccountId: revenueId,
      amountIdr: 500_000,
    });

    postTransactionLocal(db, USER, {
      transactionType: "cash_in",
      transactionDate: "2025-07-15",
      cashAccountId: cashId,
      counterAccountId: revenueId,
      amountIdr: 300_000,
    });

    const txs = getTransactions(db, USER, { fromDate: "2025-07-01", toDate: "2025-07-31" });
    expect(txs.length).toBe(1);
    expect(txs[0].transaction_date).toBe("2025-07-15");
  });

  it("voids a transaction", () => {
    const tx = postTransactionLocal(db, USER, {
      transactionType: "cash_in",
      transactionDate: "2025-06-15",
      cashAccountId: cashId,
      counterAccountId: revenueId,
      amountIdr: 500_000,
    });

    const voided = voidTransactionLocal(db, tx.id);
    expect(voided.status).toBe("voided");

    // Should not appear in posted transactions
    const posted = getTransactions(db, USER, { status: "posted" });
    expect(posted.length).toBe(0);
  });

  it("throws on double void", () => {
    const tx = postTransactionLocal(db, USER, {
      transactionType: "cash_in",
      transactionDate: "2025-06-15",
      cashAccountId: cashId,
      counterAccountId: revenueId,
      amountIdr: 500_000,
    });

    voidTransactionLocal(db, tx.id);
    expect(() => voidTransactionLocal(db, tx.id)).toThrow("already voided");
  });

  it("throws on zero amount", () => {
    expect(() =>
      postTransactionLocal(db, USER, {
        transactionType: "cash_in",
        transactionDate: "2025-06-15",
        cashAccountId: cashId,
        counterAccountId: revenueId,
        amountIdr: 0,
      }),
    ).toThrow("positive");
  });

  it("appends outbox on create", () => {
    const before = countPendingOutbox(db, USER);
    postTransactionLocal(db, USER, {
      transactionType: "cash_in",
      transactionDate: "2025-06-15",
      cashAccountId: cashId,
      counterAccountId: revenueId,
      amountIdr: 500_000,
    });
    const after = countPendingOutbox(db, USER);
    expect(after).toBe(before + 1);
  });

  it("writes stock movement with frozen WAC and updates product (Ohmega beli)", () => {
    const prod = createProductLocal(db, USER, { code: "TELUR", name: "Telur", unit: "butir" });
    const tx = postTransactionLocal(db, USER, {
      transactionType: "purchase",
      transactionDate: "2026-08-01",
      cashAccountId: cashId,
      amountIdr: 495_000,
      productId: prod.id,
      quantityMilli: 251_000,
      unitCostMinor: 1_972 * 10_000,
    });

    const movements = getStockMovementsForTransactions(db, [tx.id]);
    expect(movements).toHaveLength(1);
    expect(movements[0].unit_cost_minor).toBe(1_972 * 10_000);

    const all = getAllProducts(db, USER);
    expect(all[0].average_cost_minor).toBe(1_972 * 10_000);
    expect(all[0].current_stock_milli).toBe(251_000);
  });
});

/* ================================================================== */
/*  Outbox                                                             */
/* ================================================================== */

describe("Outbox repository", () => {
  it("marks entries as synced", () => {
    createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset" });
    createAccountLocal(db, USER, { code: "4110", name: "Pendapatan", accountClass: "income" });

    expect(countPendingOutbox(db, USER)).toBe(2);

    const pending = getPendingOutbox(db, USER);
    markOutboxSynced(db, pending.map((e) => e.id));

    expect(countPendingOutbox(db, USER)).toBe(0);
  });

  it("only returns pending (not synced) entries", () => {
    createAccountLocal(db, USER, { code: "1110", name: "Kas", accountClass: "asset" });

    const pending = getPendingOutbox(db, USER);
    markOutboxSynced(db, [pending[0].id]);

    const remaining = getPendingOutbox(db, USER);
    expect(remaining.length).toBe(0);
  });
});
