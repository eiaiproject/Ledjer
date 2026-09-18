/**
 * Report generator — isomorphic.
 *
 * Mengambil transaksi + akun, mendatangkan jurnal secara on-the-fly,
 * lalu menghitung laporan. Tidak ada dependensi DB.
 *
 * Server queries journal_lines langsung dari tabel (backward compat).
 * Client menghitung dari transaksi (local-first).
 * Hasilnya IDENTICAL karena jurnal diturunkan secara deterministik.
 */

import type {
  Account,
  BalanceSheetReport,
  GeneralLedgerEntry,
  GeneralLedgerReport,
  JournalLine,
  ProfitLossReport,
  ReportAccountLine,
  StockMovement,
  Transaction,
} from "./types";
import { deriveCogsJournal, deriveJournal } from "./journal-rules";

/** Urutan kode akun menaik untuk baris laporan. */
function byAccountCode(a: { code: string }, b: { code: string }): number {
  return a.code.localeCompare(b.code);
}

// ── P&L (Laba Rugi) ────────────────────────────────────────────

/**
 * Hitung Laba Rugi dari transaksi dalam suatu periode.
 *
 * Logika:
 * 1. Filter transaksi posted dalam range tanggal
 * 2. Derive jurnal lines untuk setiap transaksi
 * 3. Akumulasi debit/kredit per akun
 * 4. Income = credit - debit (untuk akun income)
 * 5. Expense = debit - credit (untuk akun expense)
 * 6. Net Income = income - expense
 */
export function computeProfitLoss(
  transactions: Transaction[],
  accounts: Account[],
  fromDate: string,
  toDate: string,
  stockMovements: StockMovement[] = [],
): ProfitLossReport {
  // Filter transaksi dalam periode.
  const filtered = transactions.filter(
    (tx) =>
      tx.status === "posted" &&
      tx.transaction_date >= fromDate &&
      tx.transaction_date <= toDate,
  );

  // Derive journal lines untuk semua transaksi.
  const allLines = deriveAllJournalLines(filtered, accounts, stockMovements);

  // Akumulasi per akun.
  const accountMap = new Map<string, { debit: number; credit: number; account: Account }>();
  for (const line of allLines) {
    const acct = accounts.find((a) => a.id === line.accountId);
    if (!acct) continue;

    const existing = accountMap.get(line.accountId) ?? { debit: 0, credit: 0, account: acct };
    existing.debit += line.debitIdr;
    existing.credit += line.creditIdr;
    accountMap.set(line.accountId, existing);
  }

  // Pisahkan income vs expense.
  const incomeAccounts: ReportAccountLine[] = [];
  const expenseAccounts: ReportAccountLine[] = [];
  let income = 0;
  let expense = 0;

  for (const [, { debit, credit, account }] of accountMap) {
    if (account.account_class === "income") {
      const net = credit - debit;
      if (net !== 0) {
        incomeAccounts.push({ code: account.code, name: account.name, amount: net });
        income += net;
      }
    } else if (account.account_class === "expense") {
      const net = debit - credit;
      if (net !== 0) {
        expenseAccounts.push({ code: account.code, name: account.name, amount: net });
        expense += net;
      }
    }
  }

  incomeAccounts.sort(byAccountCode);
  expenseAccounts.sort(byAccountCode);

  return {
    fromDate,
    toDate,
    income: { total: income, accounts: incomeAccounts },
    expense: { total: expense, accounts: expenseAccounts },
    netIncome: income - expense,
  };
}

// ── Balance Sheet (Neraca) ──────────────────────────────────────

/**
 * Hitung Neraca per suatu tanggal.
 *
 * Logika:
 * 1. Filter semua transaksi posted sampai tanggal asOf
 * 2. Derive jurnal lines
 * 3. Assets = debit - credit (untuk akun asset)
 * 4. Liabilities = credit - debit (untuk akun liability)
 * 5. Equity = credit - debit (untuk akun equity) + net income
 * 6. Balance check: assets = liabilities + equity
 */
export function computeBalanceSheet(
  transactions: Transaction[],
  accounts: Account[],
  asOfDate: string,
  stockMovements: StockMovement[] = [],
): BalanceSheetReport {
  // Semua transaksi posted sampai tanggal asOf.
  const filtered = transactions.filter(
    (tx) => tx.status === "posted" && tx.transaction_date <= asOfDate,
  );

  const allLines = deriveAllJournalLines(filtered, accounts, stockMovements);

  // Akumulasi per akun.
  const accountMap = new Map<string, { debit: number; credit: number; account: Account }>();
  for (const line of allLines) {
    const acct = accounts.find((a) => a.id === line.accountId);
    if (!acct) continue;

    const existing = accountMap.get(line.accountId) ?? { debit: 0, credit: 0, account: acct };
    existing.debit += line.debitIdr;
    existing.credit += line.creditIdr;
    accountMap.set(line.accountId, existing);
  }

  // Hitung per kelas akun.
  const assetAccounts: ReportAccountLine[] = [];
  const liabilityAccounts: ReportAccountLine[] = [];
  const equityAccounts: ReportAccountLine[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalIncome = 0;
  let totalExpense = 0;

  for (const [, { debit, credit, account }] of accountMap) {
    switch (account.account_class) {
      case "asset": {
        const net = debit - credit;
        if (net !== 0) {
          assetAccounts.push({ code: account.code, name: account.name, amount: net });
          totalAssets += net;
        }
        break;
      }
      case "liability": {
        const net = credit - debit;
        if (net !== 0) {
          liabilityAccounts.push({ code: account.code, name: account.name, amount: net });
          totalLiabilities += net;
        }
        break;
      }
      case "equity": {
        const net = credit - debit;
        if (net !== 0) {
          equityAccounts.push({ code: account.code, name: account.name, amount: net });
          totalEquity += net;
        }
        break;
      }
      case "income":
        totalIncome += credit - debit;
        break;
      case "expense":
        totalExpense += debit - credit;
        break;
    }
  }

  // Net income masuk ke equity.
  const netIncome = totalIncome - totalExpense;

  assetAccounts.sort(byAccountCode);
  liabilityAccounts.sort(byAccountCode);
  equityAccounts.sort(byAccountCode);

  return {
    asOfDate,
    assets: { total: totalAssets, accounts: assetAccounts },
    liabilities: { total: totalLiabilities, accounts: liabilityAccounts },
    equity: { total: totalEquity + netIncome, accounts: equityAccounts },
    netIncome,
  };
}

// ── General Ledger (Buku Besar) ─────────────────────────────────

/**
 * Hitung Buku Besar untuk satu akun dalam suatu periode.
 */
export function computeGeneralLedger(
  transactions: Transaction[],
  accounts: Account[],
  fromDate: string,
  toDate: string,
  accountId: string,
  stockMovements: StockMovement[] = [],
): GeneralLedgerReport {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  // Filter transaksi dalam periode.
  const filtered = transactions.filter(
    (tx) =>
      tx.status === "posted" &&
      tx.transaction_date >= fromDate &&
      tx.transaction_date <= toDate,
  );

  // Sort by date.
  const sorted = [...filtered].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  const movementsByTx = new Map<string, StockMovement[]>();
  for (const sm of stockMovements) {
    const list = movementsByTx.get(sm.transaction_id) ?? [];
    list.push(sm);
    movementsByTx.set(sm.transaction_id, list);
  }

  const entries: GeneralLedgerEntry[] = [];
  let runningBalance = 0;
  const isDebitNormal = ["asset", "expense"].includes(account.account_class);

  for (const tx of sorted) {
    const lines = journalLinesForAccount(tx, accounts, movementsByTx, accountId);
    for (const line of lines) {
      runningBalance += balanceChangeFor(line, isDebitNormal);

      entries.push({
        transactionDate: tx.transaction_date,
        transactionType: tx.transaction_type,
        transactionId: tx.id,
        accountId: line.accountId,
        accountCode: account.code,
        accountName: account.name,
        debitIdr: line.debitIdr,
        creditIdr: line.creditIdr,
        balanceAfter: runningBalance,
      });
    }
  }

  return {
    fromDate,
    toDate,
    accountId,
    accountCode: account.code,
    accountName: account.name,
    entries,
  };
}

// ── Internal Helpers ────────────────────────────────────────────

/**
 * Baris jurnal satu transaksi yang menyentuh akun tertentu (termasuk HPP
 * dari movement keluar/hilang), tanpa baris nol. Dipisah dari loop utama
 * agar Buku Besar tetap mudah dibaca.
 */
function journalLinesForAccount(
  tx: Transaction,
  accounts: Account[],
  movementsByTx: Map<string, StockMovement[]>,
  accountId: string,
): JournalLine[] {
  const journal = deriveJournal(tx, accounts);
  const lines = [...journal.lines];
  const txMovements = (movementsByTx.get(tx.id) ?? []).filter(
    (sm) => sm.movement_type === "out" || sm.movement_type === "loss",
  );
  if (txMovements.length > 0) {
    lines.push(...deriveCogsJournal(txMovements, accounts, tx.user_id));
  }
  return lines.filter(
    (line) => line.accountId === accountId && (line.debitIdr !== 0 || line.creditIdr !== 0),
  );
}

/** Perubahan saldo satu baris sesuai sisi normal akun. */
function balanceChangeFor(line: JournalLine, isDebitNormal: boolean): number {
  if (isDebitNormal) return line.debitIdr - line.creditIdr;
  return line.creditIdr - line.debitIdr;
}

/**
 * Derive semua journal lines dari daftar transaksi.
 */
function deriveAllJournalLines(
  transactions: Transaction[],
  accounts: Account[],
  stockMovements: StockMovement[] = [],
): JournalLine[] {
  const allLines: JournalLine[] = [];
  const movementsByTx = new Map<string, StockMovement[]>();
  for (const sm of stockMovements) {
    const list = movementsByTx.get(sm.transaction_id) ?? [];
    list.push(sm);
    movementsByTx.set(sm.transaction_id, list);
  }

  for (const tx of transactions) {
    const journal = deriveJournal(tx, accounts);
    allLines.push(...journal.lines);

    // HPP penjualan barang (cash_in + items): WAC beku di stock_movements.
    // Movement "out" (jual) dan "loss" (pecah/konsumsi) sama-sama beban HPP.
    const txMovements = (movementsByTx.get(tx.id) ?? []).filter((sm) => sm.movement_type === "out" || sm.movement_type === "loss");
    if (txMovements.length > 0) {
      allLines.push(...deriveCogsJournal(txMovements, accounts, tx.user_id));
    }
  }

  return allLines;
}
