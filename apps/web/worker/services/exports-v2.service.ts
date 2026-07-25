// P4.4 Async Export Service
// Creates export jobs, processes in chunks, uploads to R2 with expiring URLs.

import { queryAll, queryFirst, execute, type D1Input } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, notFound } from "../http/errors";
import { generateId } from "../auth/tokens";
import {
  exportAccountsCsv,
  exportBalanceSheetCsv,
  exportGeneralLedgerCsv,
  exportProductsCsv,
  exportProfitLossCsv,
  exportTransactionsCsv,
  exportTrialBalanceCsv,
  type ExportResponse,
  type TransactionExportFilters,
  type GeneralLedgerExportFilters,
} from "./exports.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface CreateExportJobInput {
  organizationId: string;
  exportType: ExportType;
  parameters?: Record<string, unknown>;
  format?: "csv" | "xlsx";
  userId: string;
}

const MAX_EXPORT_ROWS = 50_000;
const EXPIRY_HOURS = 24; // Download links expire after 24 hours

// ---------------------------------------------------------------------------
// Job CRUD
// ---------------------------------------------------------------------------

export async function createExportJob(
  env: { DB: D1Database; EXPORT_BUCKET?: R2Bucket },
  input: CreateExportJobInput,
): Promise<ExportJob> {
  const now = Date.now();
  const id = generateId();

  await execute(
    env.DB,
    `INSERT INTO export_jobs_v2 (id, organization_id, export_type, parameters_json, format, status, progress, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0.0, ?, ?)`,
    [
      id, input.organizationId, input.exportType,
      JSON.stringify(input.parameters ?? {}),
      input.format ?? "csv",
      input.userId, now,
    ],
  );

  // Start processing immediately
  const job = await processExportJob(env, id);
  return job;
}

export async function getExportJob(
  db: D1Database,
  organizationId: string,
  jobId: string,
): Promise<ExportJob | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM export_jobs_v2 WHERE id = ? AND organization_id = ?`,
    [jobId, organizationId],
  );
  return row ? rowToJob(row) : null;
}

export async function listExportJobs(
  db: D1Database,
  organizationId: string,
  opts?: { limit?: number; offset?: number; status?: ExportStatus },
): Promise<ExportJob[]> {
  const conditions: string[] = ["organization_id = ?"];
  const params: D1Input[] = [organizationId];

  if (opts?.status) {
    conditions.push("status = ?");
    params.push(opts.status);
  }

  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM export_jobs_v2 WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, opts?.limit ?? 20, opts?.offset ?? 0],
  );

  return rows.map(rowToJob);
}

// ---------------------------------------------------------------------------
// Job Processing
// ---------------------------------------------------------------------------

/**
 * Process a single export job: generate data, upload to R2, update status.
 */
async function processExportJob(
  env: { DB: D1Database; EXPORT_BUCKET?: R2Bucket },
  jobId: string,
): Promise<ExportJob> {
  const db = env.DB;
  const bucket = env.EXPORT_BUCKET;

  // Mark as processing
  await execute(
    db,
    `UPDATE export_jobs_v2 SET status = 'processing' WHERE id = ?`,
    [jobId],
  );

  const job = await getExportJobById(db, jobId);
  if (!job) throw notFound("export_job_not_found", "Export job not found");

  try {
    // Generate export data
    const params = JSON.parse(job.parametersJson) as Record<string, unknown>;
    let result: ExportResponse;

    switch (job.exportType) {
      case "accounts":
        result = await exportAccountsCsv(db, job.organizationId);
        break;
      case "products":
        result = await exportProductsCsv(db, job.organizationId);
        break;
      case "transactions":
        result = await exportTransactionsCsv(db, job.organizationId, params as TransactionExportFilters);
        break;
      case "trial_balance":
        result = await exportTrialBalanceCsv(db, job.organizationId, (params.asOfDate as string) ?? new Date().toISOString().slice(0, 10));
        break;
      case "profit_loss":
        result = await exportProfitLossCsv(db, job.organizationId, params.fromDate as string, params.toDate as string);
        break;
      case "balance_sheet":
        result = await exportBalanceSheetCsv(db, job.organizationId, (params.asOfDate as string) ?? new Date().toISOString().slice(0, 10));
        break;
      case "general_ledger":
        result = await exportGeneralLedgerCsv(db, job.organizationId, params as GeneralLedgerExportFilters);
        break;
      default:
        throw badRequest("export_type_unsupported", `Export type '${job.exportType}' is not supported`);
    }

    // Upload to R2 if bucket is available
    let fileKey: string | null = null;
    let fileUrl: string | null = null;
    let fileSizeBytes: number | null = null;
    let fileExpiresAt: number | null = null;

    // Store export result: R2 if available, otherwise just mark completed
    if (bucket) {
      fileKey = `exports/${job.organizationId}/${job.id}/${result.filename}`;
      const encoder = new TextEncoder();
      const fileBytes = encoder.encode(result.csv);
      fileSizeBytes = fileBytes.length;

      await bucket.put(fileKey, fileBytes, {
        httpMetadata: { contentType: "text/csv; charset=utf-8" },
        customMetadata: {
          organizationId: job.organizationId,
          exportType: job.exportType,
          rowCount: String(result.totalRows ?? ""),
        },
      });

      const expiresAt = Date.now() + EXPIRY_HOURS * 3600_000;
      fileExpiresAt = expiresAt;
      fileUrl = `/api/exports-v2/${job.id}/download`;
    }

    const now = Date.now();

    // Update job as completed
    await execute(
      db,
      `UPDATE export_jobs_v2 SET
        status = 'completed', progress = 1.0,
        row_count = ?, file_key = ?, file_url = ?,
        file_expires_at = ?, file_size_bytes = ?,
        is_truncated = ?, total_available_rows = ?,
        completed_at = ?
       WHERE id = ?`,
      [
        result.totalRows ?? 0,
        fileKey, fileUrl, fileExpiresAt, fileSizeBytes,
        result.truncated ? 1 : 0,
        result.totalRows ?? null,
        now, jobId,
      ],
    );

    // Audit log
    await writeAuditStatement(db, {
      organizationId: job.organizationId,
      actorUserId: job.createdBy,
      entityType: "export",
      entityId: jobId,
      action: "export_completed",
      before: null,
      after: {
        export_type: job.exportType,
        row_count: result.totalRows,
        truncated: result.truncated,
        file_size: fileSizeBytes,
      },
      reason: null,
      current: now,
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    await execute(
      db,
      `UPDATE export_jobs_v2 SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`,
      [errMsg, Date.now(), jobId],
    );
  }

  return (await getExportJobById(db, jobId))!;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Get the download response for a completed export job.
 * Serves directly from R2 with the original filename.
 */
export async function getExportDownload(
  env: { DB: D1Database; EXPORT_BUCKET?: R2Bucket },
  organizationId: string,
  jobId: string,
): Promise<{ body: ReadableStream | null; contentType: string; filename: string } | { error: string; status: number }> {
  const job = await getExportJob(env.DB, organizationId, jobId);
  if (!job) return { error: "Export job not found", status: 404 };

  if (job.status !== "completed") {
    return { error: `Export is ${job.status}`, status: 400 };
  }

  if (!job.fileKey || !env.EXPORT_BUCKET) {
    return { error: "Export file not available", status: 404 };
  }

  // Check expiry
  if (job.fileExpiresAt && Date.now() > job.fileExpiresAt) {
    await execute(
      env.DB,
      `UPDATE export_jobs_v2 SET status = 'expired' WHERE id = ?`,
      [jobId],
    );
    return { error: "Download link has expired", status: 410 };
  }

  const object = await env.EXPORT_BUCKET.get(job.fileKey);
  if (!object) {
    return { error: "Export file not found in storage", status: 404 };
  }

  return {
    body: object.body,
    contentType: "text/csv; charset=utf-8",
    filename: exportFilename(job.exportType),
  };
}

// ---------------------------------------------------------------------------
// Cleanup Expired Jobs
// ---------------------------------------------------------------------------

/**
 * Clean up expired export jobs and files. Run via scheduled worker.
 */
export async function cleanupExpiredExports(
  env: { DB: D1Database; EXPORT_BUCKET?: R2Bucket },
): Promise<{ expired: number; deleted: number }> {
  const db = env.DB;
  const bucket = env.EXPORT_BUCKET;
  let expired = 0;
  let deleted = 0;

  // Mark jobs with expired download links
  const now = Date.now();
  const expiredJobs = await queryAll<{ id: string; file_key: string | null }>(
    db,
    `SELECT id, file_key FROM export_jobs_v2
     WHERE status = 'completed' AND file_expires_at IS NOT NULL AND file_expires_at < ?
     LIMIT 100`,
    [now],
  );

  for (const job of expiredJobs) {
    await execute(
      db,
      `UPDATE export_jobs_v2 SET status = 'expired' WHERE id = ?`,
      [job.id],
    );
    expired++;

    // Clean up R2 file
    if (job.file_key && bucket) {
      try {
        await bucket.delete(job.file_key);
        deleted++;
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Delete jobs older than 90 days
  const ninetyDaysAgo = now - 90 * 86400_000;
  const oldJobs = await queryAll<{ id: string; file_key: string | null }>(
    db,
    `SELECT id, file_key FROM export_jobs_v2
     WHERE created_at < ? AND status IN ('completed', 'expired', 'failed')
     LIMIT 100`,
    [ninetyDaysAgo],
  );

  for (const job of oldJobs) {
    // Delete from R2 if still there
    if (job.file_key && bucket) {
      try { await bucket.delete(job.file_key); } catch { /* ignore */ }
    }
    // Delete from DB
    await execute(db, `DELETE FROM export_jobs_v2 WHERE id = ?`, [job.id]);
    deleted++;
  }

  return { expired, deleted };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exportFilename(type: ExportType): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const prefix: Record<ExportType, string> = {
    accounts: "akun", products: "produk", transactions: "transaksi",
    trial_balance: "neraca_saldo", profit_loss: "laba_rugi",
    balance_sheet: "neraca", general_ledger: "buku_besar",
  };
  return `${prefix[type]}_${yyyy}${mm}${dd}.csv`;
}

/**
 * Get export job by ID without organization filter (for internal processing).
 */
async function getExportJobById(
  db: D1Database,
  jobId: string,
): Promise<ExportJob | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM export_jobs_v2 WHERE id = ?`,
    [jobId],
  );
  return row ? rowToJob(row) : null;
}

function rowToJob(row: Record<string, unknown>): ExportJob {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    exportType: row.export_type as ExportType,
    parametersJson: (row.parameters_json as string) ?? "{}",
    format: (row.format as "csv" | "xlsx") ?? "csv",
    status: row.status as ExportStatus,
    progress: (row.progress as number) ?? 0,
    rowCount: (row.row_count as number) ?? 0,
    fileKey: (row.file_key as string) ?? null,
    fileUrl: (row.file_url as string) ?? null,
    fileExpiresAt: (row.file_expires_at as number) ?? null,
    fileSizeBytes: (row.file_size_bytes as number) ?? null,
    isTruncated: (row.is_truncated as number) === 1,
    totalAvailableRows: (row.total_available_rows as number) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    completedAt: (row.completed_at as number) ?? null,
  };
}

// Re-export for route usage
export type { ExportResponse };
