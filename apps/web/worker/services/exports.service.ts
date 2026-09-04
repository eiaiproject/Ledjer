import { queryAll, queryFirst, type D1Input } from "../db/client";
import { normalizeDate } from "../http/date";
import { badRequest } from "../http/errors";

export interface ExportResponse {
  csv: string;
  filename: string;
  truncated?: boolean;
  totalRows?: number;
}

export interface TransactionExportFilters {
  fromDate?: string;
  toDate?: string;
  search?: string;
  transactionType?: string;
  status?: string;
}

interface ExportTransactionRow {
  transaction_date: string;
  transaction_number: string;
  transaction_type: string;
  status: string;
  description: string;
  cash_bank_account: string | null;
  counter_account: string | null;
  amount_idr: number;
}

/** Maximum rows for any CSV export, preventing Worker OOM (PRD EXP-01). */
export const MAX_EXPORT_ROWS = 50_000;

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    throw badRequest("csv_value_invalid", "CSV export values must be scalar");
  }

  let text = String(value as string | number | boolean)
    .replaceAll("\r\n", " ")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");

  if (/^[=+\-@\t]/.test(text)) {
    text = `'${text}`;
  }

  if (/[,"']/.test(text) || /^\s/.test(text) || /\s$/.test(text)) {
    text = `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

export function csvHeaders(filename: string): Headers {
  return new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safeFilename(filename)}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

function throwExportTooLarge(): never {
  throw badRequest(
    "export_too_large",
    "Jumlah data melebihi batas ekspor. Persempit rentang tanggal lalu coba lagi.",
  );
}

/** Export transaksi sebagai CSV UTF-8 dengan BOM (PRD EXP-01). */
export async function exportTransactionsCsv(
  db: D1Database,
  organizationId: string,
  filters: TransactionExportFilters = {},
): Promise<ExportResponse> {
  const effectiveStatus = filters.status ?? "posted";
  const effective = { ...filters, status: effectiveStatus };

  // Count first so over-limit exports are rejected without materializing
  // tens of thousands of rows into Worker memory (OOM guard).
  const total = await countTransactionsForExport(db, organizationId, effective);
  if (total > MAX_EXPORT_ROWS) throwExportTooLarge();

  const rows = await listTransactionsForExport(db, organizationId, effective);

  // Defense in depth: the bounded query below can never exceed MAX+1 rows.
  if (rows.length > MAX_EXPORT_ROWS) throwExportTooLarge();

  // Kolom per PRD §10.25. UTF-8 BOM agar terbuka benar di spreadsheet.
  const csv = `\uFEFF${toCsv(
    [
      "transaction_date",
      "transaction_number",
      "transaction_type",
      "status",
      "description",
      "cash_bank_account",
      "counter_account",
      "amount_idr",
    ],
    rows.map((t) => [
      t.transaction_date,
      t.transaction_number,
      t.transaction_type,
      t.status,
      t.description,
      t.cash_bank_account ?? "",
      t.counter_account ?? "",
      t.amount_idr,
    ]),
  )}`;

  return {
    filename: filenameFor("transaksi"),
    csv,
    totalRows: rows.length,
  };
}

function filenameFor(prefix: string, date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${prefix}_${yyyy}${mm}${dd}.csv`;
}

function safeFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, "_");
}

interface ExportFilterQuery {
  conditions: string[];
  values: D1Input[];
}

/** Shared WHERE clause for the export count + list queries. */
function buildExportFilter(
  organizationId: string,
  filters: TransactionExportFilters,
): ExportFilterQuery {
  const conditions = ["t.organization_id = ?"];
  const values: D1Input[] = [organizationId];

  if (filters.fromDate) {
    conditions.push("t.transaction_date >= ?");
    values.push(normalizeDate(filters.fromDate, "from_date_invalid"));
  }
  if (filters.toDate) {
    conditions.push("t.transaction_date <= ?");
    values.push(normalizeDate(filters.toDate, "to_date_invalid"));
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    throw badRequest("date_range_invalid", "Tanggal awal tidak boleh melewati tanggal akhir.");
  }
  if (filters.transactionType) {
    conditions.push("t.transaction_type = ?");
    values.push(filters.transactionType);
  }
  if (filters.status) {
    conditions.push("t.status = ?");
    values.push(filters.status);
  }
  if (filters.search) {
    const search = sanitizeSearch(filters.search);
    if (search) {
      conditions.push("(lower(t.description) LIKE ? ESCAPE '\\\\' OR lower(t.transaction_number) LIKE ? ESCAPE '\\\\')");
      values.push(search, search);
    }
  }
  return { conditions, values };
}

async function countTransactionsForExport(
  db: D1Database,
  organizationId: string,
  filters: TransactionExportFilters,
): Promise<number> {
  const { conditions, values } = buildExportFilter(organizationId, filters);
  const row = await queryFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM transactions t WHERE ${conditions.join(" AND ")}`,
    values,
  );
  return row?.c ?? 0;
}

async function listTransactionsForExport(
  db: D1Database,
  organizationId: string,
  filters: TransactionExportFilters,
): Promise<ExportTransactionRow[]> {
  const { conditions, values } = buildExportFilter(organizationId, filters);
  // Bounded: at most MAX_EXPORT_ROWS + 1 rows ever enter Worker memory.
  const bounded = [...values, MAX_EXPORT_ROWS + 1];

  return queryAll<ExportTransactionRow>(
    db,
    `SELECT
       t.transaction_date,
       t.transaction_number,
       t.transaction_type,
       t.status,
       t.description,
       cash.name AS cash_bank_account,
       counter.name AS counter_account,
       t.amount_idr
     FROM transactions t
     LEFT JOIN accounts cash ON cash.id = t.cash_account_id
     LEFT JOIN accounts counter ON counter.id = t.counter_account_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.transaction_date ASC, t.transaction_number ASC
     LIMIT ?`,
    bounded,
  );
}

function sanitizeSearch(input: string): string {
  const value = input.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").toLowerCase();
  if (!value) return "";
  const escaped = value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${escaped}%`;
}