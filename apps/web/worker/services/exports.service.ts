import { queryAll, type D1Input } from "../db/client";
import { badRequest } from "../http/errors";
import { listAccounts } from "./accounts.service";
import { listProducts } from "./products.service";
import {
  getBalanceSheet,
  getGeneralLedger,
  getProfitLoss,
  getTrialBalance,
} from "./reports.service";

export interface ExportResponse {
  csv: string;
  filename: string;
}

export interface TransactionExportFilters {
  fromDate?: string;
  toDate?: string;
  search?: string;
  transactionType?: string;
  status?: string;
}

export interface GeneralLedgerExportFilters {
  accountId?: string;
  fromDate: string;
  toDate: string;
}

interface ExportTransactionRow {
  transaction_date: string;
  transaction_number: string;
  transaction_type: string;
  party_name: string | null;
  description: string;
  amount: number;
  status: string;
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    throw badRequest("csv_value_invalid", "CSV export values must be scalar");
  }

  let text = String(value)
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

export async function exportAccountsCsv(
  db: D1Database,
  organizationId: string,
): Promise<ExportResponse> {
  const accounts = await listAccounts(db, organizationId);
  return {
    filename: filenameFor("akun"),
    csv: toCsv(
      ["Kode", "Nama Akun", "Tipe", "Saldo Normal", "Aktif"],
      accounts.map((account) => [
        account.code,
        account.name,
        account.account_type,
        account.normal_balance,
        account.is_active,
      ]),
    ),
  };
}

export async function exportProductsCsv(
  db: D1Database,
  organizationId: string,
): Promise<ExportResponse> {
  const products = await listProducts(db, organizationId, true);
  return {
    filename: filenameFor("produk"),
    csv: toCsv(
      [
        "Kode",
        "Nama",
        "Deskripsi",
        "Satuan",
        "Harga Beli",
        "Harga Jual",
        "Stok",
        "Stok Min",
        "Aktif",
      ],
      products.map((product) => [
        product.code,
        product.name,
        product.description ?? "",
        product.unit,
        product.purchase_price,
        product.selling_price,
        product.current_stock,
        product.min_stock,
        product.is_active,
      ]),
    ),
  };
}

export async function exportTransactionsCsv(
  db: D1Database,
  organizationId: string,
  filters: TransactionExportFilters = {},
): Promise<ExportResponse> {
  const rows = await listTransactionsForExport(db, organizationId, filters);
  return {
    filename: filenameFor("transaksi"),
    csv: toCsv(
      ["Tanggal", "No Transaksi", "Jenis", "Partai", "Deskripsi", "Nominal", "Status"],
      rows.map((transaction) => [
        transaction.transaction_date,
        transaction.transaction_number,
        transaction.transaction_type,
        transaction.party_name ?? "",
        transaction.description,
        transaction.amount,
        transaction.status,
      ]),
    ),
  };
}

export async function exportTrialBalanceCsv(
  db: D1Database,
  organizationId: string,
  asOfDate: string,
): Promise<ExportResponse> {
  const trialBalance = await getTrialBalance(db, organizationId, asOfDate);
  return {
    filename: filenameFor("neraca_saldo"),
    csv: toCsv(
      ["Kode", "Nama Akun", "Debit", "Kredit"],
      trialBalance.map((row) => [
        row.account_code,
        row.account_name,
        row.ending_debit,
        row.ending_credit,
      ]),
    ),
  };
}

export async function exportProfitLossCsv(
  db: D1Database,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<ExportResponse> {
  const profitLoss = await getProfitLoss(db, organizationId, fromDate, toDate);
  return {
    filename: filenameFor("laba_rugi"),
    csv: toCsv(
      ["Bagian", "Kode", "Nama Akun", "Jumlah"],
      profitLoss.map((row) => [
        row.section,
        row.account_code,
        row.account_name,
        row.amount,
      ]),
    ),
  };
}

export async function exportBalanceSheetCsv(
  db: D1Database,
  organizationId: string,
  asOfDate: string,
): Promise<ExportResponse> {
  const balanceSheet = await getBalanceSheet(db, organizationId, asOfDate);
  return {
    filename: filenameFor("neraca"),
    csv: toCsv(
      ["Bagian", "Kode", "Nama Akun", "Jumlah"],
      balanceSheet.map((row) => [
        row.section,
        row.account_code,
        row.account_name,
        row.amount,
      ]),
    ),
  };
}

export async function exportGeneralLedgerCsv(
  db: D1Database,
  organizationId: string,
  filters: GeneralLedgerExportFilters,
): Promise<ExportResponse> {
  // ponytail: Cap at 50k rows to prevent Worker OOM/timeout.
  const ledger = await getGeneralLedger(db, organizationId, filters);
  const capped = ledger.slice(0, 50_000);
  return {
    filename: filenameFor("buku_besar"),
    csv: toCsv(
      [
        "Tanggal",
        "No Ref",
        "Account ID",
        "Kode Akun",
        "Nama Akun",
        "Keterangan",
        "Debit",
        "Kredit",
        "Saldo",
      ],
      capped.map((row) => [
        row.entry_date,
        row.transaction_number ?? row.entry_number,
        row.account_id,
        row.account_code,
        row.account_name,
        row.description,
        row.debit,
        row.credit,
        row.running_balance,
      ]),
    ),
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

async function listTransactionsForExport(
  db: D1Database,
  organizationId: string,
  filters: TransactionExportFilters,
): Promise<ExportTransactionRow[]> {
  const conditions = [
    "t.organization_id = ?",
    "t.original_transaction_id IS NULL",
    "t.transaction_type NOT LIKE 'opening_%'",
  ];
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
    throw badRequest("date_range_invalid", "Start date must not be after end date");
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
      conditions.push(
        "(lower(t.description) LIKE ? OR lower(t.transaction_number) LIKE ? OR lower(p.name) LIKE ?)",
      );
      values.push(search, search, search);
    }
  }

  return queryAll<ExportTransactionRow>(
    db,
    `SELECT
       t.transaction_date,
       t.transaction_number,
       t.transaction_type,
       p.name AS party_name,
       t.description,
       t.amount_minor AS amount,
       t.status
     FROM transactions t
     LEFT JOIN parties p
       ON p.id = t.party_id
      AND p.organization_id = t.organization_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.transaction_date ASC, t.transaction_number ASC`,
    values,
  );
}

function sanitizeSearch(input: string): string {
  const value = input.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").toLowerCase();
  return value ? `%${value}%` : "";
}

function normalizeDate(input: string, code: string): string {
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(code, "Date must use YYYY-MM-DD format");
  }
  return value;
}
