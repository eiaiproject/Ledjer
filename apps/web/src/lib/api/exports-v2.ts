export type ExportType =
  | "transactions" | "general_ledger" | "trial_balance"
  | "profit_loss" | "balance_sheet" | "accounts" | "products";

export type ExportStatus = "pending" | "processing" | "completed" | "failed" | "expired";

export interface ExportJob {
  id: string;
  organizationId: string;
  exportType: ExportType;
  parametersJson: string;
  format: "csv" | "xlsx";
  status: ExportStatus;
  progress: number;
  rowCount: number;
  fileKey: string | null;
  fileUrl: string | null;
  fileExpiresAt: number | null;
  fileSizeBytes: number | null;
  isTruncated: boolean;
  totalAvailableRows: number | null;
  errorMessage: string | null;
  createdBy: string;
  createdAt: number;
  completedAt: number | null;
}

const EXPORT_TYPE_LABELS: Record<ExportType, string> = {
  accounts: "Bagan Akun",
  products: "Produk",
  transactions: "Transaksi",
  trial_balance: "Neraca Saldo",
  profit_loss: "Laba Rugi",
  balance_sheet: "Neraca",
  general_ledger: "Buku Besar",
};

export function exportTypeLabel(type: ExportType): string {
  return EXPORT_TYPE_LABELS[type] ?? type;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── API Functions ──────────────────────────────────────────────

export async function createExportJob(data: {
  exportType: ExportType;
  parameters?: Record<string, unknown>;
  format?: "csv" | "xlsx";
}): Promise<ExportJob> {
  const res = await fetch("/api/exports-v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create export job");
  const result = await res.json() as { job: ExportJob };
  return result.job;
}

export async function getExportJob(id: string): Promise<ExportJob> {
  const res = await fetch(`/api/exports-v2/${id}`);
  if (!res.ok) throw new Error("Failed to fetch export job");
  const result = await res.json() as { job: ExportJob };
  return result.job;
}

export async function listExportJobs(opts?: {
  status?: ExportStatus;
  limit?: number;
  offset?: number;
}): Promise<ExportJob[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(`/api/exports-v2${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error("Failed to fetch export jobs");
  const result = await res.json() as { jobs: ExportJob[] };
  return result.jobs;
}

export function getExportDownloadUrl(id: string): string {
  return `/api/exports-v2/${id}/download`;
}
