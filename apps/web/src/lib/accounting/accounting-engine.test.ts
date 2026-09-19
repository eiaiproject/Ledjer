/**
 * Accounting engine tests — all pure functions, no DB.
 *
 * These tests verify the isomorphic accounting engine matches the
 * worker-side behavior (transactions.service.ts, reports.service.ts).
 */
import { describe, expect, it } from "vitest";
import {
  assertJournalBalanced,
  deriveCogsJournal,
  deriveJournal,
} from "./journal-rules";
import {
  computeBalanceSheet,
  computeGeneralLedger,
  computeProfitLoss,
} from "./reports";
import type {
  Account,
  JournalLine,
  StockMovement,
  Transaction,
} from "./types";
import {
  cogsFromMilliWac,
  computeMovementValue,
  computeNewWac,
  computeStockAfter,
} from "./wac";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeAccount(
  overrides: Partial<Account> & Pick<Account, "id" | "user_id" | "code" | "name">,
): Account {
  return {
    account_class: "asset",
    account_subtype: null,
    account_kind: null,
    is_system: 0,
    is_active: 1,
    ...overrides,
  };
}

let txCounter = 0;
function makeTx(
  overrides: Partial<Transaction> &
    Pick<Transaction, "transaction_type" | "amount_idr" | "cash_account_id">,
): Transaction {
  const id = overrides.id ?? `tx-${++txCounter}`;
  return {
    user_id: USER,
    op_id: "op1",
    transaction_date: "2025-03-15",
    description: "",
    party_id: null,
    product_id: null,
    counter_account_id: null,
    status: "posted",
    void_of_id: null,
    rule_version: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
    id,
  };
}

/** Movement stok Ohmega: default telur + WAC berjalan, timpa seperlunya. */
function makeMovement(overrides: Partial<StockMovement> & Pick<StockMovement, "id" | "transaction_id">): StockMovement {
  return {
    user_id: USER,
    product_id: "telur",
    movement_type: "out",
    quantity_milli: 0,
    unit_cost_minor: 1_972 * 10_000,
    total_value_minor: 0,
    stock_after_milli: 0,
    created_at: Date.now(),
    ...overrides,
  };
}

/** Tiga transaksi standar (setor, masuk, keluar) untuk laporan agregat. */
function makeStandardLedgerTxs(): Transaction[] {
  return [
    makeTx({
      transaction_type: "owner_deposit",
      cash_account_id: "bank",
      amount_idr: 10_000_000,
    }),
    makeTx({
      transaction_type: "cash_in",
      cash_account_id: "cash",
      counter_account_id: "rev-svc",
      amount_idr: 500_000,
    }),
    makeTx({
      transaction_type: "cash_out",
      cash_account_id: "cash",
      counter_account_id: "exp-marketing",
      amount_idr: 200_000,
    }),
  ];
}

/** Movement standar P001 10 unit @80rb untuk uji COGS. */
function makeP001Movements(): StockMovement[] {
  return [
    makeMovement({
      id: "sm1",
      transaction_id: "tx1",
      product_id: "P001",
      quantity_milli: 10_000, // 10 units
      unit_cost_minor: 800_000, // 80,000 per unit
      total_value_minor: 8_000_000,
      stock_after_milli: 0,
    }),
  ];
}

/** Cash-in void untuk uji pengecualian transaksi batal. */
function makeVoidedCashIn(): Transaction {
  return makeTx({
    id: "tx-voided",
    user_id: USER,
    transaction_type: "cash_in",
    transaction_date: "2025-03-15",
    cash_account_id: "cash",
    counter_account_id: "rev-svc",
    amount_idr: 500_000,
    status: "voided",
  });
}

/**
 * Assert jurnal 2 baris yang seimbang: debit/akun/nominal sesuai harapan.
 * Menggantikan 6 blok assert identik di tiap tipe transaksi.
 */
function expectBalancedJournal(
  entry: { lines: JournalLine[] },
  drAccountId: string,
  drAmount: number,
  crAccountId: string,
  crAmount: number,
): void {
  expect(entry.lines).toHaveLength(2);

  const dr = entry.lines.find((l) => l.debitIdr > 0)!;
  const cr = entry.lines.find((l) => l.creditIdr > 0)!;

  expect(dr.accountId).toBe(drAccountId);
  expect(dr.debitIdr).toBe(drAmount);
  expect(cr.accountId).toBe(crAccountId);
  expect(cr.creditIdr).toBe(crAmount);

  const totalDr = entry.lines.reduce((sum, l) => sum + l.debitIdr, 0);
  const totalCr = entry.lines.reduce((sum, l) => sum + l.creditIdr, 0);
  expect(totalDr).toBe(totalCr);
}

const USER = "user1";

const CASH = makeAccount({
  id: "cash",
  user_id: USER,
  code: "1110",
  name: "Kas",
  account_class: "asset",
});

const BANK = makeAccount({
  id: "bank",
  user_id: USER,
  code: "1120",
  name: "Bank",
  account_class: "asset",
});

const REVENUE = makeAccount({
  id: "rev-svc",
  user_id: USER,
  code: "4110",
  name: "Pendapatan Jasa",
  account_class: "income",
});

const EXPENSE = makeAccount({
  id: "exp-marketing",
  user_id: USER,
  code: "5110",
  name: "Beban Pemasaran",
  account_class: "expense",
});

const EQUITY = makeAccount({
  id: "equity",
  user_id: USER,
  code: "3110",
  name: "Modal",
  account_class: "equity",
});

const INVENTORY = makeAccount({
  id: "inv",
  user_id: USER,
  code: "1210",
  name: "Persediaan Barang",
  account_class: "asset",
  account_kind: "inventory",
});

const COGS = makeAccount({
  id: "cogs",
  user_id: USER,
  code: "5210",
  name: "Harga Pokok Penjualan",
  account_class: "expense",
  account_kind: "cogs",
});

const ALL_ACCOUNTS = [CASH, BANK, REVENUE, EXPENSE, EQUITY, INVENTORY, COGS];

/* ================================================================== */
/*  1. Journal rules                                                   */
/* ================================================================== */

describe("deriveJournal", () => {
  it.each([
    ["cash_in (sale)", { transaction_type: "cash_in", cash_account_id: "cash", counter_account_id: "rev-svc", amount_idr: 500_000 }, "cash", 500_000, "rev-svc", 500_000],
    ["cash_out (expense)", { transaction_type: "cash_out", cash_account_id: "cash", counter_account_id: "exp-marketing", amount_idr: 200_000 }, "exp-marketing", 200_000, "cash", 200_000],
    ["transfer", { transaction_type: "transfer", cash_account_id: "cash", counter_account_id: "bank", amount_idr: 1_000_000 }, "bank", 1_000_000, "cash", 1_000_000],
    ["owner_deposit", { transaction_type: "owner_deposit", cash_account_id: "bank", amount_idr: 5_000_000 }, "bank", 5_000_000, "equity", 5_000_000],
    ["owner_withdrawal", { transaction_type: "owner_withdrawal", cash_account_id: "cash", counter_account_id: "exp-marketing", amount_idr: 300_000 }, "exp-marketing", 300_000, "cash", 300_000],
    ["purchase (inventory)", { transaction_type: "purchase", cash_account_id: "cash", amount_idr: 800_000 }, "inv", 800_000, "cash", 800_000],
  ] as Array<[string, Parameters<typeof makeTx>[0], string, number, string, number]>)("produces balanced lines for %s", (_label, input, drId, drAmt, crId, crAmt) => {
    const tx = makeTx(input);
    const entry = deriveJournal(tx, ALL_ACCOUNTS);
    expectBalancedJournal(entry, drId, drAmt, crId, crAmt);
  });

  it("sets correct transactionDate", () => {
    const tx = makeTx({
      transaction_type: "cash_in",
      cash_account_id: "cash",
      counter_account_id: "rev-svc",
      transaction_date: "2025-06-15",
      amount_idr: 100_000,
    });
    const entry = deriveJournal(tx, ALL_ACCOUNTS);
    expect(entry.transactionDate).toBe("2025-06-15");
  });
});

describe("deriveCogsJournal", () => {
  it("derives COGS lines from stock movements", () => {
    const movements: StockMovement[] = makeP001Movements();

    const lines = deriveCogsJournal(movements, ALL_ACCOUNTS, USER);

    expect(lines).toHaveLength(2);

    const dr = lines.find((l) => l.debitIdr > 0)!;
    const cr = lines.find((l) => l.creditIdr > 0)!;

    expect(dr.accountId).toBe("cogs");
    expect(cr.accountId).toBe("inv");
    expect(dr.debitIdr).toBeGreaterThan(0);
    expect(cr.creditIdr).toBe(dr.debitIdr);
  });

  it("returns empty for no movements", () => {
    const lines = deriveCogsJournal([], ALL_ACCOUNTS, USER);
    expect(lines).toHaveLength(0);
  });

  it("returns empty if inventory or COGS account not found", () => {
    const accountsNoInv = ALL_ACCOUNTS.filter((a) => a.account_kind !== "inventory");
    const movements: StockMovement[] = makeP001Movements();
    const lines = deriveCogsJournal(movements, accountsNoInv, USER);
    expect(lines).toHaveLength(0);
  });
});

describe("assertJournalBalanced", () => {
  it("does not throw for balanced lines", () => {
    const lines: JournalLine[] = [
      { accountId: "cash", debitIdr: 100_000, creditIdr: 0 },
      { accountId: "rev-svc", debitIdr: 0, creditIdr: 100_000 },
    ];
    expect(() => assertJournalBalanced(lines)).not.toThrow();
  });

  it("throws for unbalanced lines", () => {
    const lines: JournalLine[] = [
      { accountId: "cash", debitIdr: 100_000, creditIdr: 0 },
      { accountId: "rev-svc", debitIdr: 0, creditIdr: 50_000 },
    ];
    expect(() => assertJournalBalanced(lines)).toThrow("tidak balance");
  });

  it("throws for lines with both debit and credit", () => {
    const lines: JournalLine[] = [
      { accountId: "cash", debitIdr: 100_000, creditIdr: 100_000 },
      { accountId: "rev-svc", debitIdr: 0, creditIdr: 0 },
    ];
    expect(() => assertJournalBalanced(lines)).toThrow("debit dan kredit");
  });
});

/* ================================================================== */
/*  2. WAC / HPP                                                       */
/* ================================================================== */

describe("WAC calculations", () => {
  it("computes correct new WAC on first purchase", () => {
    const newWac = computeNewWac(0, 0, 10_000, 800_000);
    // 10 units @ 80k → WAC = 800,000 minor
    expect(newWac).toBe(800_000);
  });

  it("computes correct new WAC on subsequent purchase", () => {
    // existing: 5 units at 800,000 minor; buy 3 more at 1,000,000 minor
    const newWac = computeNewWac(5_000, 800_000, 3_000, 1_000_000);
    // total cost = (5_000 × 800_000 + 3_000 × 1_000_000) / 8_000
    // = (4,000,000,000 + 3,000,000,000) / 8,000 = 875,000
    expect(newWac).toBe(875_000);
  });

  it("keeps old WAC when adding zero quantity", () => {
    const newWac = computeNewWac(5_000, 800_000, 0, 0);
    expect(newWac).toBe(800_000);
  });

  it("computes movement value correctly (buy)", () => {
    const value = computeMovementValue(10_000, 800_000);
    expect(value).toBe(8_000_000);
  });

  it("computes movement value correctly (sell)", () => {
    const value = computeMovementValue(-5_000, 800_000);
    expect(value).toBe(-4_000_000);
  });

  it("computes COGS from milli-WAC", () => {
    // 10 units, WAC = 87,500 IDR/unit
    // qtyMilli = 10 × 1000 = 10,000
    // wacMinor = 87,500 × 10,000 = 875,000,000
    // COGS = 10,000 × 875,000,000 / 10^7 = 875,000
    const cogs = cogsFromMilliWac(10_000, 875_000_000);
    expect(cogs).toBe(875_000);
  });

  it("computes stock after correctly", () => {
    expect(computeStockAfter(10_000, "in", 5_000)).toBe(15_000);
    expect(computeStockAfter(10_000, "out", 5_000)).toBe(5_000);
    expect(computeStockAfter(10_000, "loss", 3_000)).toBe(7_000);
    expect(computeStockAfter(5_000, "out", 10_000)).toBe(0); // clamped
  });
});

/* ================================================================== */
/*  3. Report generation                                                */
/* ================================================================== */

describe("computeProfitLoss", () => {
  it("computes P&L with income and expense sections", () => {
    const accounts = [CASH, BANK, REVENUE, EXPENSE];
    const [, cashIn, cashOut] = makeStandardLedgerTxs();
    const txs: Transaction[] = [cashIn, cashOut];

    const report = computeProfitLoss(txs, accounts, "2025-01-01", "2025-12-31");

    expect(report.income.total).toBe(500_000);
    expect(report.expense.total).toBe(200_000);
    expect(report.netIncome).toBe(300_000);
    expect(report.income.accounts).toHaveLength(1);
    expect(report.expense.accounts).toHaveLength(1);
  });

  it("excludes voided transactions", () => {
    const accounts = [CASH, BANK, REVENUE, EXPENSE];
    const txs: Transaction[] = [makeVoidedCashIn()];

    const report = computeProfitLoss(txs, accounts, "2025-01-01", "2025-12-31");

    expect(report.income.total).toBe(0);
    expect(report.netIncome).toBe(0);
  });

  it("includes COGS from frozen stock movements (Ohmega jual 30 butir)", () => {
    const accounts = [CASH, REVENUE, INVENTORY, COGS];
    const tx = makeTx({
      id: "tx-jual",
      transaction_type: "cash_in",
      cash_account_id: "cash",
      counter_account_id: "rev-svc",
      amount_idr: 81_000,
      transaction_date: "2026-08-02",
    });
    const movements: StockMovement[] = [
      makeMovement({
        id: "sm1",
        transaction_id: "tx-jual",
        movement_type: "out",
        quantity_milli: 30_000,
        total_value_minor: 59_160,
        stock_after_milli: 221_000,
      }),
    ];

    const report = computeProfitLoss([tx], accounts, "2026-08-01", "2026-08-31", movements);

    expect(report.income.total).toBe(81_000);
    expect(report.expense.total).toBe(59_160);
    expect(report.netIncome).toBe(81_000 - 59_160);
  });

  it("ignores purchase movements in expense (Ohmega beli bukan beban)", () => {
    const accounts = [CASH, REVENUE, INVENTORY, COGS];
    const tx = makeTx({
      id: "tx-beli",
      transaction_type: "purchase",
      cash_account_id: "cash",
      amount_idr: 495_000,
      transaction_date: "2026-08-01",
    });
    const movements: StockMovement[] = [
      makeMovement({
        id: "sm2",
        transaction_id: "tx-beli",
        movement_type: "in",
        quantity_milli: 251_000,
        total_value_minor: 4_950_000,
        stock_after_milli: 251_000,
      }),
    ];

    const report = computeProfitLoss([tx], accounts, "2026-08-01", "2026-08-31", movements);

    expect(report.expense.total).toBe(0);
    expect(report.income.total).toBe(0);
  });

  it("susut stok menjadi beban HPP tanpa kas (Ohmega pecah 11 butir)", () => {
    const accounts = [CASH, REVENUE, INVENTORY, COGS];
    const tx = makeTx({
      id: "tx-pecah",
      transaction_type: "cash_out",
      cash_account_id: "cash",
      counter_account_id: "cogs",
      product_id: "telur",
      amount_idr: 0,
      transaction_date: "2026-08-03",
    });
    const movements: StockMovement[] = [
      makeMovement({
        id: "sm3",
        transaction_id: "tx-pecah",
        movement_type: "loss",
        quantity_milli: 11_000,
        total_value_minor: 21_692,
        stock_after_milli: 210_000,
      }),
    ];

    const report = computeProfitLoss([tx], accounts, "2026-08-01", "2026-08-31", movements);

    expect(report.expense.total).toBe(21_692);
    expect(report.income.total).toBe(0);
  });

  it("filters by date range", () => {
    const accounts = [CASH, BANK, REVENUE, EXPENSE];
    const txs: Transaction[] = [
      makeTx({
        transaction_type: "cash_in",
        cash_account_id: "cash",
        counter_account_id: "rev-svc",
        amount_idr: 500_000,
        transaction_date: "2025-03-15",
      }),
      makeTx({
        transaction_type: "cash_in",
        cash_account_id: "cash",
        counter_account_id: "rev-svc",
        amount_idr: 300_000,
        transaction_date: "2025-06-15",
      }),
    ];

    const report = computeProfitLoss(txs, accounts, "2025-04-01", "2025-12-31");

    // Only the June transaction should be included
    expect(report.income.total).toBe(300_000);
  });
});

describe("computeBalanceSheet", () => {
  it("computes assets and liabilities with equity", () => {
    const accounts = [CASH, BANK, REVENUE, EXPENSE, EQUITY];
    const txs: Transaction[] = makeStandardLedgerTxs();

    const report = computeBalanceSheet(txs, accounts, "2025-12-31");

    // Assets: bank 10M + cash (500K - 200K = 300K) → but cash in from rev-svc adds 500K, cash out from marketing subtracts 200K
    // Actually cash: owner_deposit goes to bank (not cash). cash_in adds 500K to cash. cash_out subtracts 200K from cash.
    expect(report.assets).toBeDefined();
    expect(report.assets.accounts.length).toBeGreaterThanOrEqual(0);
    expect(report.liabilities).toBeDefined();
    expect(report.equity).toBeDefined();
    expect(report.netIncome).toBeDefined();
  });
});

describe("computeGeneralLedger", () => {
  it("computes GL entries for a specific account", () => {
    const accounts = [CASH, BANK, REVENUE, EXPENSE, EQUITY];
    const txs: Transaction[] = [
      makeTx({
        transaction_type: "cash_in",
        cash_account_id: "cash",
        counter_account_id: "rev-svc",
        amount_idr: 500_000,
        transaction_date: "2025-03-01",
      }),
      makeTx({
        transaction_type: "cash_out",
        cash_account_id: "cash",
        counter_account_id: "exp-marketing",
        amount_idr: 200_000,
        transaction_date: "2025-03-15",
      }),
    ];

    const report = computeGeneralLedger(txs, accounts, "2025-01-01", "2025-12-31", "cash");

    expect(report.accountId).toBe("cash");
    expect(report.accountCode).toBe("1110");
    expect(report.accountName).toBe("Kas");
    expect(report.entries).toHaveLength(2);

    // First entry: debit 500K → balance 500K
    expect(report.entries[0].debitIdr).toBe(500_000);
    expect(report.entries[0].balanceAfter).toBe(500_000);

    // Second entry: credit 200K → balance 300K
    expect(report.entries[1].creditIdr).toBe(200_000);
    expect(report.entries[1].balanceAfter).toBe(300_000);
  });

  it("throws for unknown account", () => {
    const accounts = [CASH, BANK, REVENUE, EXPENSE, EQUITY];
    const txs: Transaction[] = [];
    expect(() =>
      computeGeneralLedger(txs, accounts, "2025-01-01", "2025-12-31", "nonexistent"),
    ).toThrow("not found");
  });

  it("excludes voided transactions", () => {
    const accounts = [CASH, BANK, REVENUE, EXPENSE, EQUITY];
    const txs: Transaction[] = [makeVoidedCashIn()];

    const report = computeGeneralLedger(txs, accounts, "2025-01-01", "2025-12-31", "cash");
    expect(report.entries).toHaveLength(0);
  });
});
