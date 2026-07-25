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
  period: { fromDate: string; toDate: string };
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

export async function getCashFlowStatement(
  db: D1Database,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<CashFlowReport> {
  // Get opening cash balance (sum of all cash account balances before fromDate)
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

  // Get closing cash balance (all cash account balances up to toDate)
  const closingRows = await queryAll<{ balance: number }>(
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
  const closingCash = closingRows[0]?.balance ?? 0;

  // Get cash movements by transaction type in period
  const movements = await queryAll<{
    transaction_type: string;
    debit_minor: number;
    credit_minor: number;
  }>(
    db,
    `SELECT t.transaction_type, jl.debit_minor, jl.credit_minor
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

  // Group by transaction type
  const typeMap = new Map<string, { debit: number; credit: number }>();
  for (const m of movements) {
    const key = m.transaction_type || "unknown";
    const entry = typeMap.get(key) || { debit: 0, credit: 0 };
    entry.debit += m.debit_minor;
    entry.credit += m.credit_minor;
    typeMap.set(key, entry);
  }

  const rows: CashFlowRow[] = [];
  const sectionTotals = { operating: 0, investing: 0, financing: 0 };

  for (const [txType, amounts] of typeMap) {
    const section = CATEGORY_SECTION[txType] ?? "operating";
    const label = CATEGORY_LABELS[txType] ?? txType.replace(/_/g, " ");
    // For cash accounts: debit = inflow (money coming in), credit = outflow
    const inflow = amounts.debit;
    const outflow = amounts.credit;
    const net = inflow - outflow;
    sectionTotals[section] += net;

    rows.push({ section, transactionType: txType, label, inflow, outflow, net });
  }

  // Sort: operating first, then investing, then financing
  rows.sort((a, b) => {
    const order = { operating: 0, investing: 1, financing: 2 };
    return order[a.section] - order[b.section];
  });

  const netCashFlow = sectionTotals.operating + sectionTotals.investing + sectionTotals.financing;

  return {
    rows,
    totals: {
      ...sectionTotals,
      netCashFlow,
      openingCash,
      closingCash,
    },
    period: { fromDate, toDate },
  };
}
