// P3.4 Budgets and Forecasts Service
// Supports account-level budgets, actual vs budget reports, variance alerts,
// and simple forecast capability.

import { queryAll, queryFirst, statement, executeBatch, type D1Input } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, notFound } from "../http/errors";
import { generateId } from "../auth/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Budget {
  id: string;
  organizationId: string;
  accountId: string;
  accountName?: string;
  accountCode?: string;
  periodFrom: string;
  periodTo: string;
  amountMinor: number;
  dimensionType: string | null;
  dimensionValue: string | null;
  notes: string;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  lines?: BudgetLine[];
}

export interface BudgetLine {
  id: string;
  budgetId: string;
  organizationId: string;
  month: string;
  amountMinor: number;
}

export interface ActualVsBudget {
  accountId: string;
  accountName: string;
  accountCode: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number | null;
  periodFrom: string;
  periodTo: string;
}

export interface BudgetSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePercent: number | null;
  accounts: ActualVsBudget[];
}

export interface VarianceAlert {
  accountId: string;
  accountName: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number;
  direction: "over_budget" | "under_budget";
}

// ---------------------------------------------------------------------------
// Budget CRUD
// ---------------------------------------------------------------------------

export async function listBudgets(
  db: D1Database,
  organizationId: string,
  opts?: {
    accountId?: string;
    isActive?: boolean;
    periodFrom?: string;
    periodTo?: string;
    limit?: number;
    offset?: number;
  },
): Promise<Budget[]> {
  const conditions: string[] = ["b.organization_id = ?"];
  const params: D1Input[] = [organizationId];

  if (opts?.accountId) {
    conditions.push("b.account_id = ?");
    params.push(opts.accountId);
  }
  if (opts?.isActive !== undefined) {
    conditions.push("b.is_active = ?");
    params.push(opts.isActive ? 1 : 0);
  }
  if (opts?.periodFrom) {
    conditions.push("b.period_to >= ?");
    params.push(opts.periodFrom);
  }
  if (opts?.periodTo) {
    conditions.push("b.period_from <= ?");
    params.push(opts.periodTo);
  }

  const where = conditions.join(" AND ");
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rows = await queryAll<{
    id: string; organization_id: string; account_id: string;
    account_name: string | null; account_code: string | null;
    period_from: string; period_to: string;
    amount_minor: number;
    dimension_type: string | null; dimension_value: string | null;
    notes: string; is_active: number;
    created_by: string; created_at: number; updated_at: number;
  }>(
    db,
    `SELECT b.*, a.name as account_name, a.code as account_code
     FROM budgets b
     LEFT JOIN accounts a ON a.id = b.account_id AND a.organization_id = b.organization_id
     WHERE ${where}
     ORDER BY b.period_from DESC, a.code ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return rows.map(rowToBudget);
}

export async function getBudget(
  db: D1Database,
  organizationId: string,
  budgetId: string,
): Promise<Budget | null> {
  const row = await queryFirst<{
    id: string; organization_id: string; account_id: string;
    account_name: string | null; account_code: string | null;
    period_from: string; period_to: string;
    amount_minor: number;
    dimension_type: string | null; dimension_value: string | null;
    notes: string; is_active: number;
    created_by: string; created_at: number; updated_at: number;
  }>(
    db,
    `SELECT b.*, a.name as account_name, a.code as account_code
     FROM budgets b
     LEFT JOIN accounts a ON a.id = b.account_id AND a.organization_id = b.organization_id
     WHERE b.id = ? AND b.organization_id = ?`,
    [budgetId, organizationId],
  );

  if (!row) return null;

  // Fetch budget lines
  const lines = await queryAll<{
    id: string; budget_id: string; organization_id: string;
    month: string; amount_minor: number;
  }>(
    db,
    `SELECT * FROM budget_lines WHERE budget_id = ? ORDER BY month ASC`,
    [budgetId],
  );

  return {
    ...rowToBudget(row),
    lines: lines.map((l) => ({
      id: l.id,
      budgetId: l.budget_id,
      organizationId: l.organization_id,
      month: l.month,
      amountMinor: l.amount_minor,
    })),
  };
}

export async function createBudget(
  db: D1Database,
  organizationId: string,
  userId: string,
  data: {
    accountId: string;
    periodFrom: string;
    periodTo: string;
    amountMinor: number;
    dimensionType?: string | null;
    dimensionValue?: string | null;
    notes?: string;
    lines?: { month: string; amountMinor: number }[];
  },
): Promise<Budget> {
  // Validate period
  if (data.periodFrom > data.periodTo) {
    throw badRequest("budget_invalid_period", "Period from must be before period to");
  }

  // Check for existing budget for same account + period
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM budgets
     WHERE organization_id = ? AND account_id = ? AND period_from = ? AND period_to = ?
       AND is_active = 1
     LIMIT 1`,
    [organizationId, data.accountId, data.periodFrom, data.periodTo],
  );
  if (existing) {
    throw badRequest("budget_exists", "A budget already exists for this account and period. Update it instead.");
  }

  const now = Date.now();
  const id = generateId();
  const lines = data.lines ?? [];

  // Validate line months are within period
  for (const line of lines) {
    if (line.month < data.periodFrom.slice(0, 7) || line.month > data.periodTo.slice(0, 7)) {
      throw badRequest("budget_line_out_of_range", `Month ${line.month} is outside budget period`);
    }
  }

  const statements = [
    statement(
      db,
      `INSERT INTO budgets (id, organization_id, account_id, period_from, period_to, amount_minor,
        dimension_type, dimension_value, notes, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id, organizationId, data.accountId, data.periodFrom, data.periodTo, data.amountMinor,
        data.dimensionType ?? null, data.dimensionValue ?? null, data.notes ?? "", userId, now, now,
      ],
    ),
    ...lines.map((line) =>
      statement(
        db,
        `INSERT INTO budget_lines (id, budget_id, organization_id, month, amount_minor)
         VALUES (?, ?, ?, ?, ?)`,
        [generateId(), id, organizationId, line.month, line.amountMinor],
      ),
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "budget",
      entityId: id,
      action: "budget_created",
      before: null,
      after: {
        account_id: data.accountId,
        period_from: data.periodFrom,
        period_to: data.periodTo,
        amount_minor: data.amountMinor,
      },
      reason: null,
      current: now,
    }),
  ];

  await executeBatch(db, statements);

  return (await getBudget(db, organizationId, id))!;
}

export async function updateBudget(
  db: D1Database,
  organizationId: string,
  userId: string,
  budgetId: string,
  data: {
    amountMinor?: number;
    notes?: string;
    isActive?: boolean;
    dimensionType?: string | null;
    dimensionValue?: string | null;
    lines?: { month: string; amountMinor: number }[];
  },
): Promise<Budget> {
  const existing = await getBudget(db, organizationId, budgetId);
  if (!existing) throw notFound("budget_not_found", "Budget not found");

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  statements.push(
    statement(
      db,
      `UPDATE budgets SET
        amount_minor = COALESCE(?, amount_minor),
        notes = COALESCE(?, notes),
        is_active = COALESCE(?, is_active),
        dimension_type = ?,
        dimension_value = ?,
        updated_at = ?
       WHERE id = ? AND organization_id = ?`,
      [
        data.amountMinor ?? null,
        data.notes ?? null,
        data.isActive === undefined ? null : data.isActive ? 1 : 0,
        data.dimensionType !== undefined ? data.dimensionType : null,
        data.dimensionValue !== undefined ? data.dimensionValue : null,
        now, budgetId, organizationId,
      ],
    ),
  );

  // If lines are provided, replace all lines
  if (data.lines) {
    statements.push(
      statement(db, `DELETE FROM budget_lines WHERE budget_id = ?`, [budgetId]),
    );
    for (const line of data.lines) {
      statements.push(
        statement(
          db,
          `INSERT INTO budget_lines (id, budget_id, organization_id, month, amount_minor)
           VALUES (?, ?, ?, ?, ?)`,
          [generateId(), budgetId, organizationId, line.month, line.amountMinor],
        ),
      );
    }
  }

  statements.push(
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "budget",
      entityId: budgetId,
      action: "budget_updated",
      before: existing,
      after: data,
      reason: null,
      current: now,
    }),
  );

  await executeBatch(db, statements);

  return (await getBudget(db, organizationId, budgetId))!;
}

export async function deleteBudget(
  db: D1Database,
  organizationId: string,
  userId: string,
  budgetId: string,
): Promise<void> {
  const existing = await getBudget(db, organizationId, budgetId);
  if (!existing) throw notFound("budget_not_found", "Budget not found");

  // Soft delete — set inactive
  const now = Date.now();
  await executeBatch(db, [
    statement(
      db,
      `UPDATE budgets SET is_active = 0, updated_at = ? WHERE id = ? AND organization_id = ?`,
      [now, budgetId, organizationId],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "budget",
      entityId: budgetId,
      action: "budget_deleted",
      before: existing,
      after: null,
      reason: null,
      current: now,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Actual vs Budget Report
// ---------------------------------------------------------------------------

/**
 * Calculate actual vs budget for all active budgets in a given period.
 * Returns comparison data for each budget account, plus totals.
 */
export async function getActualVsBudget(
  db: D1Database,
  organizationId: string,
  periodFrom: string,
  periodTo: string,
): Promise<BudgetSummary> {
  // 1. Get all active budgets overlapping the period
  const budgets = await queryAll<{
    account_id: string;
    account_name: string | null;
    account_code: string | null;
    budget_id: string;
    budget_amount: number;
    budget_from: string;
    budget_to: string;
  }>(
    db,
    `SELECT
       b.account_id,
       a.name as account_name,
       a.code as account_code,
       b.id as budget_id,
       b.amount_minor as budget_amount,
       b.period_from as budget_from,
       b.period_to as budget_to
     FROM budgets b
     LEFT JOIN accounts a ON a.id = b.account_id AND a.organization_id = b.organization_id
     WHERE b.organization_id = ?
       AND b.is_active = 1
       AND b.period_from <= ?
       AND b.period_to >= ?`,
    [organizationId, periodTo, periodFrom],
  );

  if (budgets.length === 0) {
    return {
      totalBudget: 0,
      totalActual: 0,
      totalVariance: 0,
      totalVariancePercent: null,
      accounts: [],
    };
  }

  // 2. Get actual amounts for each budget account within the intersection period
  const accountIds = budgets.map((b) => b.account_id);
  const placeholders = accountIds.map(() => "?").join(",");

  // Normal balance determines sign: debit accounts (assets, expense) = debit-positive
  // Credit accounts (liability, equity, revenue) = credit-positive
  const actuals = await queryAll<{
    account_id: string;
    actual_amount: number;
  }>(
    db,
    `SELECT
       jl.account_id,
       COALESCE(SUM(
         CASE WHEN a.normal_balance = 'debit' THEN jl.debit_minor - jl.credit_minor
              ELSE jl.credit_minor - jl.debit_minor END
       ), 0) as actual_amount
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
     WHERE jl.organization_id = ?
       AND je.status = 'posted'
       AND je.entry_date >= ?
       AND je.entry_date <= ?
       AND jl.account_id IN (${placeholders})
     GROUP BY jl.account_id`,
    [organizationId, periodFrom, periodTo, ...accountIds],
  );

  const actualMap = new Map<string, number>();
  for (const a of actuals) {
    actualMap.set(a.account_id, a.actual_amount);
  }

  // 3. Build comparison
  let totalBudget = 0;
  let totalActual = 0;

  const accounts: ActualVsBudget[] = budgets.map((b) => {
    const actual = Math.abs(actualMap.get(b.account_id) ?? 0);
    const budgetAmount = b.budget_amount;
    const variance = actual - budgetAmount;
    const variancePercent = budgetAmount > 0
      ? Math.round((variance / budgetAmount) * 10000) / 100
      : null;

    totalBudget += budgetAmount;
    totalActual += actual;

    return {
      accountId: b.account_id,
      accountName: b.account_name ?? "Unknown Account",
      accountCode: b.account_code ?? "",
      budgetAmount,
      actualAmount: actual,
      variance,
      variancePercent,
      periodFrom,
      periodTo,
    };
  });

  const totalVariance = totalActual - totalBudget;
  const totalVariancePercent = totalBudget > 0
    ? Math.round((totalVariance / totalBudget) * 10000) / 100
    : null;

  return {
    totalBudget,
    totalActual,
    totalVariance,
    totalVariancePercent,
    accounts,
  };
}

// ---------------------------------------------------------------------------
// Variance Alerts
// ---------------------------------------------------------------------------

/**
 * Check for material budget variances (over budget by threshold %).
 * Returns alerts for accounts exceeding the configured threshold.
 */
export async function checkBudgetVariance(
  db: D1Database,
  organizationId: string,
  thresholdPercent = 20,
): Promise<VarianceAlert[]> {
  const now = new Date();
  const periodFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const periodTo = now.toISOString().slice(0, 10);

  const summary = await getActualVsBudget(db, organizationId, periodFrom, periodTo);
  const alerts: VarianceAlert[] = [];

  for (const account of summary.accounts) {
    if (account.variancePercent !== null && account.variancePercent > thresholdPercent) {
      alerts.push({
        accountId: account.accountId,
        accountName: account.accountName,
        budgetAmount: account.budgetAmount,
        actualAmount: account.actualAmount,
        variance: account.variance,
        variancePercent: account.variancePercent,
        direction: account.variance > 0 ? "over_budget" : "under_budget",
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Simple Forecast
// ---------------------------------------------------------------------------

export interface ForecastResult {
  accountId: string;
  accountName: string;
  forecastAmount: number;
  confidenceInterval: { low: number; high: number } | null;
  method: "average" | "last_period";
}

/**
 * Generate a simple forecast based on historical actuals.
 * Uses trailing 3-month average (or fewer months if not enough data).
 */
export async function generateForecast(
  db: D1Database,
  organizationId: string,
  accountId: string,
  monthsAhead = 3,
): Promise<ForecastResult> {
  // Get trailing 6 months of actual data
  const now = new Date();
  const trailingStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const trailingFrom = trailingStart.toISOString().slice(0, 10);
  const trailingTo = now.toISOString().slice(0, 10);

  const monthlyData = await queryAll<{ month: string; amount: number }>(
    db,
    `SELECT
       substr(je.entry_date, 1, 7) as month,
       COALESCE(SUM(
         CASE WHEN a.normal_balance = 'debit' THEN jl.debit_minor - jl.credit_minor
              ELSE jl.credit_minor - jl.debit_minor END
       ), 0) as amount
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
     WHERE jl.organization_id = ? AND jl.account_id = ?
       AND je.status = 'posted'
       AND je.entry_date >= ? AND je.entry_date <= ?
     GROUP BY substr(je.entry_date, 1, 7)
     ORDER BY month DESC
     LIMIT 6`,
    [organizationId, accountId, trailingFrom, trailingTo],
  );

  // Get account name
  const account = await queryFirst<{ name: string }>(
    db,
    `SELECT name FROM accounts WHERE id = ? AND organization_id = ?`,
    [accountId, organizationId],
  );

  if (monthlyData.length === 0) {
    return {
      accountId,
      accountName: account?.name ?? "Unknown",
      forecastAmount: 0,
      confidenceInterval: null,
      method: "average",
    };
  }

  // Calculate trailing 3-month average
  const recentMonths = monthlyData.slice(0, Math.min(3, monthlyData.length));
  const totalAmount = recentMonths.reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const avgAmount = Math.round(totalAmount / recentMonths.length);

  // Simple std dev for confidence interval
  const variance = recentMonths.reduce((sum, m) => {
    const diff = Math.abs(m.amount) - avgAmount;
    return sum + diff * diff;
  }, 0) / recentMonths.length;
  const stdDev = Math.round(Math.sqrt(variance));

  return {
    accountId,
    accountName: account?.name ?? "Unknown",
    forecastAmount: avgAmount * monthsAhead,
    confidenceInterval: {
      low: Math.max(0, (avgAmount - stdDev) * monthsAhead),
      high: (avgAmount + stdDev) * monthsAhead,
    },
    method: monthlyData.length >= 3 ? "average" : "last_period",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToBudget(row: {
  id: string; organization_id: string; account_id: string;
  account_name: string | null; account_code: string | null;
  period_from: string; period_to: string;
  amount_minor: number;
  dimension_type: string | null; dimension_value: string | null;
  notes: string; is_active: number;
  created_by: string; created_at: number; updated_at: number;
}): Budget {
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    accountName: row.account_name ?? undefined,
    accountCode: row.account_code ?? undefined,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    amountMinor: row.amount_minor,
    dimensionType: row.dimension_type,
    dimensionValue: row.dimension_value,
    notes: row.notes,
    isActive: row.is_active === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
