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

export interface ForecastResult {
  accountId: string;
  accountName: string;
  forecastAmount: number;
  confidenceInterval: { low: number; high: number } | null;
  method: "average" | "last_period";
}

// ── Budget CRUD ─────────────────────────────────────────────────

export async function listBudgets(opts?: {
  accountId?: string;
  isActive?: boolean;
  periodFrom?: string;
  periodTo?: string;
  limit?: number;
  offset?: number;
}): Promise<Budget[]> {
  const params = new URLSearchParams();
  if (opts?.accountId) params.set("accountId", opts.accountId);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.periodFrom) params.set("periodFrom", opts.periodFrom);
  if (opts?.periodTo) params.set("periodTo", opts.periodTo);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/api/budgets${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error("Failed to fetch budgets");
  const data = await res.json() as { budgets: Budget[] };
  return data.budgets;
}

export async function getBudget(id: string): Promise<Budget> {
  const res = await fetch(`/api/budgets/${id}`);
  if (!res.ok) throw new Error("Failed to fetch budget");
  const data = await res.json() as { budget: Budget };
  return data.budget;
}

export async function createBudget(data: {
  accountId: string;
  periodFrom: string;
  periodTo: string;
  amountMinor: number;
  dimensionType?: string | null;
  dimensionValue?: string | null;
  notes?: string;
  lines?: { month: string; amountMinor: number }[];
}): Promise<Budget> {
  const res = await fetch("/api/budgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create budget");
  const result = await res.json() as { budget: Budget };
  return result.budget;
}

export async function updateBudget(
  id: string,
  data: {
    amountMinor?: number;
    notes?: string;
    isActive?: boolean;
    dimensionType?: string | null;
    dimensionValue?: string | null;
    lines?: { month: string; amountMinor: number }[];
  },
): Promise<Budget> {
  const res = await fetch(`/api/budgets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update budget");
  const result = await res.json() as { budget: Budget };
  return result.budget;
}

export async function deleteBudget(id: string): Promise<void> {
  const res = await fetch(`/api/budgets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete budget");
}

// ── Reports ─────────────────────────────────────────────────────

export async function getActualVsBudget(
  periodFrom: string,
  periodTo: string,
): Promise<BudgetSummary> {
  const res = await fetch(
    `/api/budgets/report/actual-vs-budget?periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch budget report");
  return res.json() as Promise<BudgetSummary>;
}

export async function getBudgetVarianceAlerts(
  threshold = 20,
): Promise<VarianceAlert[]> {
  const res = await fetch(`/api/budgets/variance-alerts?threshold=${threshold}`);
  if (!res.ok) throw new Error("Failed to fetch variance alerts");
  const data = await res.json() as { alerts: VarianceAlert[] };
  return data.alerts;
}

export async function generateForecast(
  accountId: string,
  monthsAhead = 3,
): Promise<ForecastResult> {
  const res = await fetch("/api/budgets/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, monthsAhead }),
  });
  if (!res.ok) throw new Error("Failed to generate forecast");
  const data = await res.json() as { forecast: ForecastResult };
  return data.forecast;
}
