// ponytail: Direct-method cash flow statement. Analyzes cash account movements
// grouped by transaction type. Does not handle investing activities (asset
// purchases) or financing activities beyond owner capital/draw — the current
// transaction taxonomy doesn't distinguish them. Upgrade: add transaction_type
// values for investing/financing or map specific account codes.

import { queryAll } from "../db/client";

export interface CashFlowRow {
  section: "operating" | "investing" | "financing";
  transactionType: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  /** Previous period comparison (if comparePeriod is set) */
  prevInflow?: number;
  prevOutflow?: number;
  prevNet?: number;
  /** IDs of transactions in this period (for drill-down) */
  transactionIds?: string[];
}

export interface CashFlowReport {
  rows: CashFlowRow[];
  totals: {
    operating: number;
    investing: number;
    financing: number;
    netCashFlow: number;
    openingCash: number;
    closingCash: number;
  };
  /** Previous period totals (if comparePeriod is set) */
  prevTotals?: {
    operating: number;
    investing: number;
    financing: number;
    netCashFlow: number;
    openingCash: number;
    closingCash: number;
  };
  period: { fromDate: string; toDate: string };
  prevPeriod?: { fromDate: string; toDate: string };
}

const CATEGORY_LABELS: Record<string, string> = {
  cash_sale: "Penjualan Tunai",
  cash_purchase: "Pembelian Tunai",
  operating_expense: "Biaya Operasional",
  credit_sale: "Penerimaan Piutang",
  credit_purchase: "Pembayaran Utang",
  owner_capital: "Setoran Modal",
  owner_draw: "Prive",
  cash_transfer: "Transfer Kas (Internal)",
  receivable_settlement: "Penyelesaian Piutang",
  payable_settlement: "Pembayaran Utang",
  partial_payment: "Pembayaran Sebagian",
  // ponytail: sale_return and purchase_return not yet in transaction_type taxonomy.
  // When added, map: sale_return → operating (outflow), purchase_return → operating (inflow)
};

function periodLengthDays(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function queryCashMovements(
  db: D1Database,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<{
  byType: Map<string, { debit: number; credit: number; txnIds: Set<string> }>;
  openingCash: number;
}> {
  // Opening cash balance
  const openingRows = await queryAll<{ balance: number }>(
    db,
    `SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
     WHERE jl.organization_id = ?
       AND a.is_cash_account = 1
       AND je.status = 'posted'
       AND je.entry_date < ?`,
    [organizationId, fromDate],
  );
  const openingCash = openingRows[0]?.balance ?? 0;

  // Cash movements by transaction type with transaction IDs
  const movements = await queryAll<{
    transaction_type: string;
    debit_minor: number;
    credit_minor: number;
    transaction_id: string;
  }>(
    db,
    `SELECT t.transaction_type, jl.debit_minor, jl.credit_minor,
            COALESCE(t.id, '') as transaction_id
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
     LEFT JOIN transactions t ON t.id = je.transaction_id AND t.organization_id = jl.organization_id
     WHERE jl.organization_id = ?
       AND a.is_cash_account = 1
       AND je.status = 'posted'
       AND je.entry_date BETWEEN ? AND ?
       AND je.entry_type != 'opening_balance'`,
    [organizationId, fromDate, toDate],
  );

  const byType = new Map<string, { debit: number; credit: number; txnIds: Set<string> }>();
  for (const m of movements) {
    const key = m.transaction_type || "unknown";
    const entry = byType.get(key) || { debit: 0, credit: 0, txnIds: new Set<string>() };
    entry.debit += m.debit_minor;
    entry.credit += m.credit_minor;
    if (m.transaction_id) entry.txnIds.add(m.transaction_id);
    byType.set(key, entry);
  }

  return { byType, openingCash };
}

function buildRowsFromMap(
  byType: Map<string, { debit: number; credit: number; txnIds: Set<string> }>,
  prevByType?: Map<string, { debit: number; credit: number; txnIds: Set<string> }>,
): CashFlowRow[] {
  const rows: CashFlowRow[] = [];

  for (const [txType, amounts] of byType) {
    const section = CATEGORY_SECTION[txType] ?? "operating";
    const label = CATEGORY_LABELS[txType] ?? txType.replace(/_/g, " ");
    const inflow = amounts.debit;
    const outflow = amounts.credit;
    const net = inflow - outflow;

    const row: CashFlowRow = {
      section, transactionType: txType, label,
      inflow, outflow, net,
      transactionIds: [...amounts.txnIds],
    };

    // Previous period comparison
    if (prevByType) {
      const prev = prevByType.get(txType);
      if (prev) {
        row.prevInflow = prev.debit;
        row.prevOutflow = prev.credit;
        row.prevNet = prev.debit - prev.credit;
      } else {
        row.prevInflow = 0;
        row.prevOutflow = 0;
        row.prevNet = 0;
      }
    }

    rows.push(row);
  }

  rows.sort((a, b) => {
    const order = { operating: 0, investing: 1, financing: 2 };
    return order[a.section] - order[b.section];
  });

  return rows;
}

function computeTotals(rows: CashFlowRow[]): {
  operating: number; investing: number; financing: number; netCashFlow: number;
} {
  const totals = { operating: 0, investing: 0, financing: 0, netCashFlow: 0 };
  for (const r of rows) {
    totals[r.section] += r.net;
  }
  totals.netCashFlow = totals.operating + totals.investing + totals.financing;
  return totals;
}

const CATEGORY_SECTION: Record<string, "operating" | "investing" | "financing"> = {
  cash_sale: "operating",
  cash_purchase: "operating",
  operating_expense: "operating",
  credit_sale: "operating",
  credit_purchase: "operating",
  receivable_settlement: "operating",
  payable_settlement: "operating",
  partial_payment: "operating",
  owner_capital: "financing",
  owner_draw: "financing",
  cash_transfer: "operating", // internal, nets to zero
};

/**
 * Get closing cash balance (all cash account balances up to toDate).
 */
async function getClosingCash(
  db: D1Database,
  organizationId: string,
  toDate: string,
): Promise<number> {
  const rows = await queryAll<{ balance: number }>(
    db,
    `SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
     WHERE jl.organization_id = ?
       AND a.is_cash_account = 1
       AND je.status = 'posted'
       AND je.entry_date <= ?`,
    [organizationId, toDate],
  );
  return rows[0]?.balance ?? 0;
}

export async function getCashFlowStatement(
  db: D1Database,
  organizationId: string,
  fromDate: string,
  toDate: string,
  comparePeriod?: boolean,
): Promise<CashFlowReport> {
  // Current period
  const { byType, openingCash } = await queryCashMovements(db, organizationId, fromDate, toDate);

  // Previous period (same length, immediately before current)
  let prevByType: Map<string, { debit: number; credit: number; txnIds: Set<string> }> | undefined;
  let prevOpeningCash = 0;
  let prevPeriod: { fromDate: string; toDate: string } | undefined;

  if (comparePeriod) {
    const days = periodLengthDays(fromDate, toDate);
    const prevFrom = subtractDays(fromDate, days + 1);
    const prevTo = subtractDays(fromDate, 1);
    prevPeriod = { fromDate: prevFrom, toDate: prevTo };

    const prevResult = await queryCashMovements(db, organizationId, prevFrom, prevTo);
    prevByType = prevResult.byType;
    prevOpeningCash = prevResult.openingCash;
  }

  // Build rows
  const rows = buildRowsFromMap(byType, prevByType);
  const closingCash = await getClosingCash(db, organizationId, toDate);

  // Current period totals
  const totals = {
    ...computeTotals(rows),
    openingCash,
    closingCash,
  };

  const result: CashFlowReport = {
    rows,
    totals,
    period: { fromDate, toDate },
  };

  // Previous period totals
  if (prevByType && prevPeriod) {
    const prevRows = buildRowsFromMap(prevByType);
    const prevClosingCash = await getClosingCash(db, organizationId, prevPeriod.toDate);
    const prevTotals = {
      ...computeTotals(prevRows),
      openingCash: prevOpeningCash,
      closingCash: prevClosingCash,
    };
    result.prevTotals = prevTotals;
    result.prevPeriod = prevPeriod;
  }

  return result;
}
