import { queryAll } from "../db/client";
import { listAccounts, balancesByAccount } from "./accounts.service";
import { getProfitLoss } from "./reports.service";
import { listTransactions, type PublicTransaction } from "./transactions.service";

export interface DashboardSummary {
  cashBankBalance: number;
  cashBankAccounts: { id: string; code: string; name: string; balance: number }[];
  month: { from: string; to: string };
  moneyIn: number;
  moneyOut: number;
  netIncome: number;
  recentTransactions: PublicTransaction[];
}

/** First and last day of the current month in Asia/Jakarta. */
export function currentMonthPeriod(date = new Date()): { from: string; to: string } {
  const jakarta = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).format(date);
  const [year, month] = jakarta.split("-");
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    from: `${jakarta}-01`,
    to: `${jakarta}-${String(lastDay).padStart(2, "0")}`,
  };
}

export async function getDashboardSummary(
  db: D1Database,
  organizationId: string,
): Promise<DashboardSummary> {
  const cashAccounts = await listAccounts(db, organizationId, { subtype: "cash" });
  const bankAccounts = await listAccounts(db, organizationId, { subtype: "bank" });
  const balances = await balancesByAccount(db, organizationId);

  const cashBankAccounts = [...cashAccounts, ...bankAccounts].map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    balance: balances.get(a.id) ?? 0,
  }));
  const cashBankBalance = cashBankAccounts.reduce((s, a) => s + a.balance, 0);

  const month = currentMonthPeriod();
  const pl = await getProfitLoss(db, organizationId, month.from, month.to);
  const recentTransactions = await listTransactions(db, organizationId, { limit: 5 });
  const { moneyIn, moneyOut } = await cashFlowByType(db, organizationId, month.from, month.to);

  return {
    cashBankBalance,
    cashBankAccounts,
    month,
    moneyIn,
    moneyOut,
    netIncome: pl.netIncome,
    recentTransactions,
  };
}

/**
 * Uang masuk/keluar aktual per bulan, dikelompokkan per jenis transaksi
 * (bukan per kelas akun) agar pembelian barang ke Persediaan terhitung sebagai
 * uang keluar dan HPP (beban non-tunai) tidak ikut terhitung.
 */
async function cashFlowByType(
  db: D1Database,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<{ moneyIn: number; moneyOut: number }> {
  const rows = await queryAll<{ transaction_type: string; total: number }>(
    db,
    `SELECT transaction_type, COALESCE(SUM(amount_idr), 0) AS total
     FROM transactions
     WHERE organization_id = ? AND status = 'posted'
       AND transaction_date >= ? AND transaction_date <= ?
     GROUP BY transaction_type`,
    [organizationId, fromDate, toDate],
  );
  const byType = new Map(rows.map((r) => [r.transaction_type, r.total ?? 0]));
  const moneyInTypes = ["cash_in", "owner_deposit"];
  const moneyOutTypes = ["cash_out", "owner_withdrawal", "purchase"];
  const moneyIn = moneyInTypes.reduce((s, t) => s + (byType.get(t) ?? 0), 0);
  const moneyOut = moneyOutTypes.reduce((s, t) => s + (byType.get(t) ?? 0), 0);
  return { moneyIn, moneyOut };
}

/** Alerts ringan untuk dashboard: akun kas/bank bersaldo negatif. */
export async function getDashboardAlerts(
  db: D1Database,
  organizationId: string,
): Promise<{ negativeBalanceAccounts: { id: string; name: string; balance: number }[] }> {
  const accounts = await listAccounts(db, organizationId);
  const balances = await balancesByAccount(db, organizationId);
  const negativeBalanceAccounts = accounts
    .filter((a) => a.account_subtype !== null && (balances.get(a.id) ?? 0) < 0)
    .map((a) => ({ id: a.id, name: a.name, balance: balances.get(a.id) ?? 0 }));
  return { negativeBalanceAccounts };
}