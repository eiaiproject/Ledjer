/**
 * Journal derivation rules — jurnal diturunkan dari tipe transaksi.
 *
 * Sesuai Bagian 08 dokumen perencanaan:
 * - Jurnal TIDAK disimpan sebagai tabel → diturunkan secara deterministik.
 * - Setiap tipe transaksi punya aturan debit/kredit yang tetap.
 * - rule_version memungkinkan aturan berubah di masa depan tanpa
 *   mengubah data historis.
 *
 * Semua fungsi di sini PURE — tidak ada dependensi DB atau I/O.
 */

import type {
  Account,
  JournalEntry,
  JournalLine,
  StockMovement,
  Transaction,
} from "./types";
import { cogsFromMilliWac } from "./wac";

// ── Account kind tags ───────────────────────────────────────────

/**
 * Tag khusus akun yang dipakai oleh mesin akuntansi.
 * Di skema lokal, ini ada di kolom `account_kind`.
 */
export const ACCOUNT_KINDS = {
  INVENTORY: "inventory",
  COGS: "cogs",
} as const;

// ── Journal derivation ──────────────────────────────────────────

/**
 * Derive journal lines dari satu transaksi.
 *
 * Ini implementasi dari aturan di Bagian 08:
 * - SALE: Kas DR / Pendapatan CR + HPP DR / Persediaan CR
 * - PURCHASE: Persediaan DR / Kas CR + update WAC
 * - EXPENSE: Beban DR / Kas CR
 * - TRANSFER: Kas Tujuan DR / Kas Sumber CR
 * - OWNER_DEPOSIT: Kas DR / Modal CR
 * - OWNER_WITHDRAWAL: Prive DR / Kas CR
 * - STOCK_LOSS: Beban/HPP DR / Persediaan CR
 *
 * @param tx — transaksi yang sudah di-post
 * @param accounts — semua akun user (untuk resolve account_kind)
 * @returns JournalEntry yang siap dipakai untuk report
 */
export function deriveJournal(
  tx: Transaction,
  accounts: Account[],
): JournalEntry {
  const lines = deriveJournalLines(tx, accounts);

  return {
    transactionId: tx.id,
    transactionDate: tx.transaction_date,
    lines,
  };
}

/**
 * Derive journal lines (internal).
 */
function deriveJournalLines(
  tx: Transaction,
  accounts: Account[],
): JournalLine[] {
  const cashAccount = accounts.find((a) => a.id === tx.cash_account_id);
  if (!cashAccount) {
    throw new Error(`Cash account ${tx.cash_account_id} not found`);
  }

  switch (tx.transaction_type) {
    case "cash_in":
    case "owner_deposit":
      return deriveCashIn(tx, cashAccount, accounts);

    case "cash_out":
    case "owner_withdrawal":
      // Susut non-kas ditandai via product_id + amount 0: jurnalnya
      // HPP DR / Persediaan CR (dibentuk dari stock_movements "loss",
      // bukan dari Kas). deriveAllJournalLines yang menambahkan barisnya.
      if (tx.transaction_type === "cash_out" && tx.amount_idr === 0 && tx.product_id) {
        return [];
      }
      return deriveCashOut(tx, cashAccount, accounts);

    case "transfer":
      return deriveTransfer(tx, cashAccount, accounts);

    case "purchase":
      return derivePurchase(tx, cashAccount, accounts);

    default:
      throw new Error(`Unknown transaction type: ${tx.transaction_type}`);
  }
}

// ── Cash In (Sale + Owner Deposit) ──────────────────────────────

/**
 * SALE (jual):
 *   Kas/Bank DR — nominal diterima
 *   Pendapatan CR — nominal
 *   + HPP DR — qty × WAC beku (dari stock_movements)
 *   + Persediaan CR — qty × WAC beku (dari stock_movements)
 *
 * OWNER_DEPOSIT:
 *   Kas/Bank DR — nominal
 *   Modal CR — nominal
 */
function deriveCashIn(
  tx: Transaction,
  cashAccount: Account,
  accounts: Account[],
): JournalLine[] {
  const lines: JournalLine[] = [
    // Kas DR
    { accountId: cashAccount.id, debitIdr: tx.amount_idr, creditIdr: 0 },
  ];

  if (tx.transaction_type === "owner_deposit") {
    // Modal CR
    const equityAccount = accounts.find(
      (a) => a.code === "3110" && a.user_id === tx.user_id,
    );
    if (equityAccount) {
      lines.push({ accountId: equityAccount.id, debitIdr: 0, creditIdr: tx.amount_idr });
    }
  } else {
    // cash_in (sale): Pendapatan CR
    const counterAccount = accounts.find((a) => a.id === tx.counter_account_id);
    if (counterAccount) {
      lines.push({ accountId: counterAccount.id, debitIdr: 0, creditIdr: tx.amount_idr });
    }
  }

  return lines;
}

// ── Cash Out (Expense + Owner Withdrawal) ───────────────────────

/**
 * EXPENSE (beban):
 *   Beban sesuai kategori DR — nominal
 *   Kas/Bank CR — nominal
 *
 * OWNER_WITHDRAWAL (prive):
 *   Prive DR — nominal
 *   Kas/Bank CR — nominal
 */
function deriveCashOut(
  tx: Transaction,
  cashAccount: Account,
  accounts: Account[],
): JournalLine[] {
  const counterAccount = accounts.find((a) => a.id === tx.counter_account_id);

  return [
    // Beban/Prive DR
    {
      accountId: counterAccount?.id ?? tx.counter_account_id ?? "",
      debitIdr: tx.amount_idr,
      creditIdr: 0,
    },
    // Kas CR
    { accountId: cashAccount.id, debitIdr: 0, creditIdr: tx.amount_idr },
  ];
}

// ── Transfer ────────────────────────────────────────────────────

/**
 * TRANSFER:
 *   Kas/Bank tujuan DR — nominal
 *   Kas/Bank asal CR — nominal
 */
function deriveTransfer(
  tx: Transaction,
  cashAccount: Account,
  accounts: Account[],
): JournalLine[] {
  const targetAccount = accounts.find((a) => a.id === tx.counter_account_id);

  return [
    // Tujuan DR
    {
      accountId: targetAccount?.id ?? tx.counter_account_id ?? "",
      debitIdr: tx.amount_idr,
      creditIdr: 0,
    },
    // Sumber CR
    { accountId: cashAccount.id, debitIdr: 0, creditIdr: tx.amount_idr },
  ];
}

// ── Purchase ────────────────────────────────────────────────────

/**
 * PURCHASE (beli):
 *   Persediaan DR — nominal
 *   Kas/Bank CR — nominal
 *   + update WAC (diproses terpisah di stock_movements)
 */
function derivePurchase(
  tx: Transaction,
  cashAccount: Account,
  accounts: Account[],
): JournalLine[] {
  const inventoryAccount = accounts.find(
    (a) => a.account_kind === ACCOUNT_KINDS.INVENTORY && a.user_id === tx.user_id,
  );

  return [
    // Persediaan DR
    {
      accountId: inventoryAccount?.id ?? "",
      debitIdr: tx.amount_idr,
      creditIdr: 0,
    },
    // Kas CR
    { accountId: cashAccount.id, debitIdr: 0, creditIdr: tx.amount_idr },
  ];
}

// ── Goods Sale (COGS) ───────────────────────────────────────────

/**
 * Tambahan jurnal untuk penjualan barang (SALE dengan items):
 *   HPP DR — qty × WAC beku (dari stock_movements.unit_cost_minor)
 *   Persediaan CR — qty × WAC beku
 *
 * Fungsi ini dipanggil SETELAH deriveCashIn untuk menambah baris HPP.
 * Data WAC beku diambil dari stock_movements yang sudah dicatat.
 */
export function deriveCogsJournal(
  stockMovements: Array<Pick<StockMovement, "unit_cost_minor" | "quantity_milli">>,
  accounts: Account[],
  userId: string,
): JournalLine[] {
  const inventoryAccount = accounts.find(
    (a) => a.account_kind === ACCOUNT_KINDS.INVENTORY && a.user_id === userId,
  );
  const cogsAccount = accounts.find(
    (a) => a.account_kind === ACCOUNT_KINDS.COGS && a.user_id === userId,
  );

  if (!inventoryAccount || !cogsAccount) return [];

  // Movement keluar disimpan negatif (jual = -qty); HPP selalu nilai absolut.
  let totalCogs = 0;
  for (const sm of stockMovements) {
    totalCogs += cogsFromMilliWac(Math.abs(sm.quantity_milli), sm.unit_cost_minor);
  }

  if (totalCogs <= 0) return [];

  return [
    // HPP DR
    { accountId: cogsAccount.id, debitIdr: totalCogs, creditIdr: 0 },
    // Persediaan CR
    { accountId: inventoryAccount.id, debitIdr: 0, creditIdr: totalCogs },
  ];
}

// ── Validation ──────────────────────────────────────────────────

/**
 * Assert journal is balanced: total debit == total credit.
 * Dipakai saat authoring transaction (bukan saat reading).
 */
export function assertJournalBalanced(lines: readonly JournalLine[]): void {
  const debit = lines.reduce((s, l) => s + l.debitIdr, 0);
  const credit = lines.reduce((s, l) => s + l.creditIdr, 0);
  if (debit !== credit) {
    throw new Error(
      `Jurnal tidak balance: debit ${debit} != credit ${credit}`,
    );
  }
  for (const line of lines) {
    if (line.debitIdr > 0 && line.creditIdr > 0) {
      throw new Error(
        `Baris jurnal ${line.accountId} punya debit dan kredit sekaligus`,
      );
    }
  }
}
