export type AssetCategory =
  | "building" | "machinery" | "vehicle" | "office_equipment"
  | "computer" | "furniture" | "land" | "other";

export type DepreciationMethod = "straight_line" | "declining_balance" | "sum_of_years_digits";

export type AssetStatus = "active" | "disposed" | "sold" | "impaired";

export interface FixedAsset {
  id: string;
  organizationId: string;
  assetCode: string;
  assetName: string;
  assetCategory: AssetCategory;
  description: string;
  acquisitionDate: string;
  acquisitionCostMinor: number;
  residualValueMinor: number;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  decliningBalanceRate: number | null;
  accountAssetId: string;
  accountDepreciationId: string;
  accountExpenseId: string;
  status: AssetStatus;
  disposalDate: string | null;
  disposalPriceMinor: number | null;
  disposalReason: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  bookValueMinor?: number;
  accumulatedMinor?: number;
  lastDepreciationPeriod?: string | null;
}

export interface BookValueReport {
  assetId: string;
  assetCode: string;
  assetName: string;
  assetCategory: string;
  acquisitionDate: string;
  acquisitionCost: number;
  accumulatedDepreciation: number;
  bookValue: number;
  residualValue: number;
  depreciationMethod: string;
  usefulLifeMonths: number;
  monthsElapsed: number;
  monthlyDepreciation: number;
  status: string;
}

export interface DepreciationRunResult {
  entriesCreated: number;
  entriesSkipped: number;
  errors: string[];
  totalExpense: number;
  period: string;
}

export interface PostDepreciationResult {
  posted: number;
  journalEntryId: string | null;
  errors: string[];
}

export interface PendingDepreciation {
  entries: { assetCode: string; assetName: string; expenseMinor: number }[];
  totalExpense: number;
}

const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  building: "Bangunan",
  machinery: "Mesin",
  vehicle: "Kendaraan",
  office_equipment: "Peralatan Kantor",
  computer: "Komputer",
  furniture: "Furniture",
  land: "Tanah",
  other: "Lainnya",
};

const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: "Garis Lurus",
  declining_balance: "Saldo Menurun",
  sum_of_years_digits: "Jumlah Angka Tahun",
};

export function assetCategoryLabel(cat: AssetCategory): string {
  return ASSET_CATEGORY_LABELS[cat] ?? cat;
}

export function depreciationMethodLabel(method: DepreciationMethod): string {
  return DEPRECIATION_METHOD_LABELS[method] ?? method;
}

export function formatMinor(value: number): string {
  return `Rp ${(value / 100).toLocaleString("id-ID")}`;
}

// ── Asset CRUD ─────────────────────────────────────────────────

export async function listAssets(opts?: {
  status?: AssetStatus;
  category?: AssetCategory;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<FixedAsset[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.category) params.set("category", opts.category);
  if (opts?.isActive !== undefined) params.set("isActive", String(opts.isActive));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/api/fixed-assets${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch assets");
  const data = await res.json() as { assets: FixedAsset[] };
  return data.assets;
}

export async function getAsset(id: string): Promise<FixedAsset> {
  const res = await fetch(`/api/fixed-assets/${id}`);
  if (!res.ok) throw new Error("Failed to fetch asset");
  const data = await res.json() as { asset: FixedAsset };
  return data.asset;
}

export async function createAsset(data: {
  assetCode: string;
  assetName: string;
  assetCategory: AssetCategory;
  description?: string;
  acquisitionDate: string;
  acquisitionCostMinor: number;
  residualValueMinor?: number;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  decliningBalanceRate?: number | null;
  accountAssetId: string;
  accountDepreciationId: string;
  accountExpenseId: string;
}): Promise<FixedAsset> {
  const res = await fetch("/api/fixed-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create asset");
  const result = await res.json() as { asset: FixedAsset };
  return result.asset;
}

export async function updateAsset(
  id: string,
  data: Partial<{
    assetName: string;
    description: string;
    residualValueMinor: number;
    usefulLifeMonths: number;
    depreciationMethod: DepreciationMethod;
    decliningBalanceRate: number | null;
    accountAssetId: string;
    accountDepreciationId: string;
    accountExpenseId: string;
    isActive: boolean;
  }>,
): Promise<FixedAsset> {
  const res = await fetch(`/api/fixed-assets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update asset");
  const result = await res.json() as { asset: FixedAsset };
  return result.asset;
}

// ── Depreciation ───────────────────────────────────────────────

export async function runDepreciation(period: string): Promise<DepreciationRunResult> {
  const res = await fetch("/api/fixed-assets/depreciation/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period }),
  });
  if (!res.ok) throw new Error("Failed to run depreciation");
  return res.json() as Promise<DepreciationRunResult>;
}

export async function getPendingDepreciation(period: string): Promise<PendingDepreciation> {
  const res = await fetch(`/api/fixed-assets/depreciation/pending?period=${encodeURIComponent(period)}`);
  if (!res.ok) throw new Error("Failed to fetch pending depreciation");
  return res.json() as Promise<PendingDepreciation>;
}

export async function postDepreciation(
  period: string,
  entryDate: string,
): Promise<PostDepreciationResult> {
  const res = await fetch("/api/fixed-assets/depreciation/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period, entryDate }),
  });
  if (!res.ok) throw new Error("Failed to post depreciation");
  return res.json() as Promise<PostDepreciationResult>;
}

// ── Disposal ───────────────────────────────────────────────────

export async function disposeAsset(
  id: string,
  data: {
    disposalDate: string;
    disposalPriceMinor: number;
    disposalReason: string;
    disposalType: "disposed" | "sold";
  },
): Promise<FixedAsset> {
  const res = await fetch(`/api/fixed-assets/${id}/dispose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to dispose asset");
  const result = await res.json() as { asset: FixedAsset };
  return result.asset;
}

// ── Book Value Report ─────────────────────────────────────────

export async function getBookValueReport(asOfDate?: string): Promise<BookValueReport[]> {
  const params = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : "";
  const res = await fetch(`/api/fixed-assets/report/book-value${params}`);
  if (!res.ok) throw new Error("Failed to fetch book value report");
  const data = await res.json() as { report: BookValueReport[] };
  return data.report;
}
