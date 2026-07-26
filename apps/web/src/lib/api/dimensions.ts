export type DimensionType = "branch" | "department" | "project" | "cost_center" | "profit_center";

export interface Dimension {
  id: string;
  organizationId: string;
  dimensionType: DimensionType;
  code: string;
  name: string;
  description: string;
  parentId: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionTag {
  id: string;
  organizationId: string;
  transactionId: string;
  dimensionId: string;
  dimensionCode?: string;
  dimensionName?: string;
  dimensionType?: DimensionType;
  createdBy: string;
  createdAt: number;
}

export interface DimensionReportRow {
  dimensionId: string;
  dimensionCode: string;
  dimensionName: string;
  dimensionType: DimensionType;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  transactionCount: number;
}

export interface DimensionReportSummary {
  dimensionType: DimensionType;
  periodFrom: string;
  periodTo: string;
  rows: DimensionReportRow[];
  totalDebit: number;
  totalCredit: number;
}

export interface DimensionTypeSummary {
  type: DimensionType;
  count: number;
  activeCount: number;
}

const DIMENSION_TYPE_LABELS: Record<DimensionType, string> = {
  branch: "Cabang",
  department: "Departemen",
  project: "Proyek",
  cost_center: "Pusat Biaya",
  profit_center: "Pusat Laba",
};

export function dimensionTypeLabel(type: DimensionType): string {
  return DIMENSION_TYPE_LABELS[type] ?? type;
}

export function formatMinor(value: number): string {
  return `Rp ${(value / 100).toLocaleString("id-ID")}`;
}

// ── Dimension CRUD ─────────────────────────────────────────────

export async function listDimensions(opts?: {
  dimensionType?: DimensionType;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Dimension[]> {
  const params = new URLSearchParams();
  if (opts?.dimensionType) params.set("dimensionType", opts.dimensionType);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/api/dimensions${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error("Failed to fetch dimensions");
  const data = await res.json() as { dimensions: Dimension[] };
  return data.dimensions;
}

export async function getDimension(id: string): Promise<Dimension> {
  const res = await fetch(`/api/dimensions/${id}`);
  if (!res.ok) throw new Error("Failed to fetch dimension");
  const data = await res.json() as { dimension: Dimension };
  return data.dimension;
}

export async function createDimension(data: {
  dimensionType: DimensionType;
  code: string;
  name: string;
  description?: string;
  parentId?: string | null;
}): Promise<Dimension> {
  const res = await fetch("/api/dimensions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create dimension");
  const result = await res.json() as { dimension: Dimension };
  return result.dimension;
}

export async function updateDimension(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    parentId: string | null;
    isActive: boolean;
  }>,
): Promise<Dimension> {
  const res = await fetch(`/api/dimensions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update dimension");
  const result = await res.json() as { dimension: Dimension };
  return result.dimension;
}

export async function deleteDimension(id: string): Promise<void> {
  const res = await fetch(`/api/dimensions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete dimension");
}

// ── Transaction Tags ───────────────────────────────────────────

export async function getTransactionTags(transactionId: string): Promise<TransactionTag[]> {
  const res = await fetch(`/api/dimensions/tags/${transactionId}`);
  if (!res.ok) throw new Error("Failed to fetch transaction tags");
  const data = await res.json() as { tags: TransactionTag[] };
  return data.tags;
}

export async function setTransactionTags(
  transactionId: string,
  dimensionIds: string[],
): Promise<TransactionTag[]> {
  const res = await fetch(`/api/dimensions/tags/${transactionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dimensionIds }),
  });
  if (!res.ok) throw new Error("Failed to set transaction tags");
  const data = await res.json() as { tags: TransactionTag[] };
  return data.tags;
}

// ── Reports ────────────────────────────────────────────────────

export async function getDimensionReport(
  dimensionType: DimensionType,
  periodFrom: string,
  periodTo: string,
): Promise<DimensionReportSummary> {
  const res = await fetch(
    `/api/dimensions/report?dimensionType=${encodeURIComponent(dimensionType)}&periodFrom=${encodeURIComponent(periodFrom)}&periodTo=${encodeURIComponent(periodTo)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch dimension report");
  return res.json() as Promise<DimensionReportSummary>;
}

export async function getDimensionSummary(): Promise<DimensionTypeSummary[]> {
  const res = await fetch("/api/dimensions/summary");
  if (!res.ok) throw new Error("Failed to fetch dimension summary");
  const data = await res.json() as { summary: DimensionTypeSummary[] };
  return data.summary;
}
