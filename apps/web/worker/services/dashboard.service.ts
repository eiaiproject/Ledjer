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

  return {
    cashBankBalance,
    cashBankAccounts,
    month,
    moneyIn: pl.income.total,
    moneyOut: pl.expense.total,
    netIncome: pl.netIncome,
    recentTransactions,
  };
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