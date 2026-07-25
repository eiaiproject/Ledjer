import { queryFirst } from "../db/client";

export interface DashboardSummary {
  cash_balance: number;
  revenue_current_period: number;
  expense_current_period: number;
  net_profit_current_period: number;
  accounts_receivable: number;
  accounts_payable: number;
  period_from: string;
  period_to: string;
}

interface DashboardSummaryRow {
  cash_balance: number | null;
  revenue_current_period: number | null;
  expense_current_period: number | null;
  accounts_receivable: number | null;
  accounts_payable: number | null;
}

/* ───── Dashboard Alerts ───── */

export interface DashboardAlert {
  id: string;
  type: "overdue_receivable" | "upcoming_payable" | "low_stock" | "draft_transaction" | "unreconciled_statement" | "unclosed_period" | "pending_approval";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  count: number;
  actionLabel: string;
  actionPath: string;
}

export interface DashboardAlerts {
  alerts: DashboardAlert[];
}

/**
 * Fetch actionable alerts for the dashboard:
 * - Overdue receivables
 * - Upcoming payables (due within 7 days)
 * - Low stock (0 stock)
 * - Draft transactions
 * - Unreconciled bank statements
 * - Unclosed previous period
 */
export async function getDashboardAlerts(
  db: D1Database,
  organizationId: string,
): Promise<DashboardAlerts> {
  const alerts: DashboardAlert[] = [];

  // 1. Overdue receivables
  const overdueRow = await queryFirst<{ count: number; total_minor: number }>(
    db,
    `SELECT COUNT(*) as count, COALESCE(SUM(
       CASE WHEN i.status = 'overdue' THEN i.total_minor - COALESCE(paid.paid_minor, 0)
       ELSE 0 END
     ), 0) as total_minor
     FROM invoices i
     LEFT JOIN (
       SELECT ipa.invoice_id, SUM(ipa.amount_minor) as paid_minor
       FROM invoice_payment_allocations ipa
       JOIN payments p ON p.id = ipa.payment_id
       GROUP BY ipa.invoice_id
     ) paid ON paid.invoice_id = i.id
     WHERE i.organization_id = ? AND i.status IN ('overdue', 'partially_paid') AND i.due_date < date('now', '+1 day')`,
    [organizationId],
  );
  if (overdueRow && overdueRow.count > 0) {
    alerts.push({
      id: "overdue_receivable",
      type: "overdue_receivable",
      severity: "high",
      title: "Piutang Jatuh Tempo",
      description: `${overdueRow.count} faktur dengan total Rp ${(overdueRow.total_minor / 100).toLocaleString("id-ID")} sudah melewati jatuh tempo.`,
      count: overdueRow.count,
      actionLabel: "Lihat Piutang",
      actionPath: "/reports/aging",
    });
  }

  // 2. Upcoming payables (due within 7 days)
  const upcomingRow = await queryFirst<{ count: number; total_minor: number }>(
    db,
    `SELECT COUNT(*) as count, COALESCE(SUM(i.total_minor - COALESCE(paid.paid_minor, 0)), 0) as total_minor
     FROM invoices i
     LEFT JOIN (
       SELECT ipa.invoice_id, SUM(ipa.amount_minor) as paid_minor
       FROM invoice_payment_allocations ipa
       JOIN payments p ON p.id = ipa.payment_id
       GROUP BY ipa.invoice_id
     ) paid ON paid.invoice_id = i.id
     WHERE i.organization_id = ? AND i.status IN ('issued', 'sent')
       AND i.due_date BETWEEN date('now') AND date('now', '+7 days')`,
    [organizationId],
  );
  if (upcomingRow && upcomingRow.count > 0) {
    alerts.push({
      id: "upcoming_payable",
      type: "upcoming_payable",
      severity: "medium",
      title: "Tagihan Mendekati Jatuh Tempo",
      description: `${upcomingRow.count} tagihan sebesar Rp ${(upcomingRow.total_minor / 100).toLocaleString("id-ID")} akan jatuh tempo dalam 7 hari ke depan.`,
      count: upcomingRow.count,
      actionLabel: "Lihat Tagihan",
      actionPath: "/invoices",
    });
  }

  // 3. Low stock products — compute actual stock from stock_movements
  const lowStockRow = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count
     FROM (
       SELECT p.id,
         p.initial_stock_minor + COALESCE(SUM(
           CASE WHEN sm.movement_type = 'in' THEN sm.quantity_minor
                WHEN sm.movement_type = 'out' THEN -sm.quantity_minor
                ELSE 0 END
         ), 0) as current_stock
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.organization_id = p.organization_id
       WHERE p.organization_id = ? AND p.is_active = 1
       GROUP BY p.id
       HAVING current_stock <= 0
     )`,
    [organizationId],
  );
  if (lowStockRow && lowStockRow.count > 0) {
    alerts.push({
      id: "low_stock",
      type: "low_stock",
      severity: "medium",
      title: "Stok Habis",
      description: `${lowStockRow.count} produk memiliki stok 0. Segera lakukan pengadaan atau penyesuaian stok.`,
      count: lowStockRow.count,
      actionLabel: "Kelola Produk",
      actionPath: "/products",
    });
  }

  // 4. Draft transactions
  const draftRow = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM transactions
     WHERE organization_id = ? AND status = 'draft'`,
    [organizationId],
  );
  if (draftRow && draftRow.count > 0) {
    alerts.push({
      id: "draft_transaction",
      type: "draft_transaction",
      severity: "low",
      title: "Transaksi Draft",
      description: `${draftRow.count} transaksi masih dalam status draft. Posting untuk mencatatnya ke pembukuan.`,
      count: draftRow.count,
      actionLabel: "Lihat Draft",
      actionPath: "/transactions",
    });
  }

  // 5. Unreconciled bank statements
  const unreconciledRow = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM bank_statements
     WHERE organization_id = ? AND status = 'open'`,
    [organizationId],
  );
  if (unreconciledRow && unreconciledRow.count > 0) {
    alerts.push({
      id: "unreconciled_statement",
      type: "unreconciled_statement",
      severity: "low",
      title: "Rekonsiliasi Belum Selesai",
      description: `${unreconciledRow.count} rekening koran masih perlu direkonsiliasi. Cocokkan transaksi untuk memastikan saldo sesuai.`,
      count: unreconciledRow.count,
      actionLabel: "Rekonsiliasi",
      actionPath: "/reconciliation",
    });
  }


  // 6.5. Pending approval requests
  const approvalRow = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM approval_requests
     WHERE organization_id = ? AND status = 'pending'`,
    [organizationId],
  );
  if (approvalRow && approvalRow.count > 0) {
    alerts.push({
      id: "pending_approval",
      type: "pending_approval",
      severity: "high",
      title: "Persetujuan Menunggu",
      description: `${approvalRow.count} permintaan menunggu persetujuan Anda. Segera tinjau untuk melanjutkan proses.`,
      count: approvalRow.count,
      actionLabel: "Tinjau Persetujuan",
      actionPath: "/approvals",
    });
  }

  // 6. Unclosed previous period
  const unclosedRow = await queryFirst<{ count: number; max_locked: string | null }>(
    db,
    `SELECT COUNT(*) as count, MAX(locked_through_date) as max_locked
     FROM period_locks WHERE organization_id = ?`,
    [organizationId],
  );
  if (unclosedRow) {
    const hasLock = unclosedRow.count > 0 && unclosedRow.max_locked;
    // Check if previous month is locked. If no locks exist at all, show alert.
    if (!hasLock) {
      alerts.push({
        id: "unclosed_period",
        type: "unclosed_period",
        severity: "medium",
        title: "Periode Belum Ditutup",
        description: "Belum ada periode yang dikunci. Tutup periode setelah selesai untuk mencegah perubahan data lama.",
        count: 1,
        actionLabel: "Kunci Periode",
        actionPath: "/settings/period-locks",
      });
    }
  }

  return { alerts };
}

export async function getDashboardSummary(
  db: D1Database,
  organizationId: string,
  today = new Date(),
): Promise<DashboardSummary> {
  const { periodFrom, periodTo } = currentMonthPeriod(today);
  const row = await queryFirst<DashboardSummaryRow>(
    db,
    `WITH posted_lines AS (
       SELECT jl.account_id, jl.debit_minor, jl.credit_minor
       FROM journal_lines jl
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_date <= ?
     ),
     posted_balances AS (
       SELECT
         account_id,
         SUM(debit_minor - credit_minor) AS debit_balance,
         SUM(credit_minor - debit_minor) AS credit_balance
       FROM posted_lines
       GROUP BY account_id
     ),
     period_lines AS (
       SELECT jl.account_id, jl.debit_minor, jl.credit_minor
       FROM journal_lines jl
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_type != 'opening_balance'
         AND je.entry_date BETWEEN ? AND ?
     ),
     period_balances AS (
       SELECT
         account_id,
         SUM(debit_minor - credit_minor) AS debit_balance,
         SUM(credit_minor - debit_minor) AS credit_balance
       FROM period_lines
       GROUP BY account_id
     )
     SELECT
       COALESCE(SUM(CASE
         WHEN a.is_cash_account = 1 THEN pb.debit_balance
         ELSE 0
       END), 0) AS cash_balance,
       COALESCE(SUM(CASE
         WHEN a.account_type IN ('revenue', 'other_income')
           THEN pe.credit_balance
         ELSE 0
       END), 0) AS revenue_current_period,
       COALESCE(SUM(CASE
         WHEN a.account_type IN ('cogs', 'expense', 'other_expense')
           THEN pe.debit_balance
         ELSE 0
       END), 0) AS expense_current_period,
       COALESCE(SUM(CASE
         WHEN a.account_subtype = 'accounts_receivable'
           THEN pb.debit_balance
         ELSE 0
       END), 0) AS accounts_receivable,
       COALESCE(SUM(CASE
         WHEN a.account_subtype = 'accounts_payable'
           THEN pb.credit_balance
         ELSE 0
       END), 0) AS accounts_payable
     FROM accounts a
     LEFT JOIN posted_balances pb ON pb.account_id = a.id
     LEFT JOIN period_balances pe ON pe.account_id = a.id
     WHERE a.organization_id = ?`,
    [organizationId, periodTo, organizationId, periodFrom, periodTo, organizationId],
  );

  const revenue = row?.revenue_current_period ?? 0;
  const expense = row?.expense_current_period ?? 0;

  return {
    cash_balance: row?.cash_balance ?? 0,
    revenue_current_period: revenue,
    expense_current_period: expense,
    net_profit_current_period: revenue - expense,
    accounts_receivable: row?.accounts_receivable ?? 0,
    accounts_payable: row?.accounts_payable ?? 0,
    period_from: periodFrom,
    period_to: periodTo,
  };
}

export function currentMonthPeriod(date: Date): {
  periodFrom: string;
  periodTo: string;
} {
  // ponytail: Use local time instead of UTC to avoid timezone drift.
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    periodFrom: isoDate(new Date(year, month, 1)),
    periodTo: isoDate(date),
  };
}

function isoDate(date: Date): string {
  return orgDate(date);
}

/**
 * Format a Date as YYYY-MM-DD in the given timezone.
 * Defaults to 'Asia/Jakarta' (WIB) for server-side usage.
 */
function orgDate(date: Date, tz = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}
