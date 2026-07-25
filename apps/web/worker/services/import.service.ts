// ponytail: RFC 4180 CSV parser for Workers (no deps). Handles quoted fields,
// escaped quotes, CRLF/LF, BOM. Does not handle multi-line quoted fields (RFC
// 4180 §2.7). Upgrade to a streaming parser for large imports.

import { execute } from "../db/client";
import { generateId } from "../auth/tokens";

export interface CsvRow {
  [column: string]: string;
}

export interface ImportPreview<T> {
  headers: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: ImportRowPreview<T>[];
  errors: ImportError[];
}

export interface ImportRowPreview<T> {
  index: number;
  row: CsvRow;
  parsed: T | null;
  errors: FieldError[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ImportResult {
  id: string;
  organizationId: string;
  importType: string;
  totalRows: number;
  insertedRows: number;
  errorRows: number;
  errors: ImportError[];
  createdBy: string;
  createdAt: number;
}

/** RFC 4180 CSV parse. Returns rows as arrays, then maps to headers. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((_, i, a) => i < a.length - 1 || _.length > 0);

  if (lines.length < 1) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function csvRowsToObjects(headers: string[], rows: string[][]): CsvRow[] {
  return rows.map((row) => {
    const obj: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i] ?? "";
    }
    return obj;
  });
}

export interface ImportValidator<T> {
  /** Human-readable name (e.g. "chart of accounts") */
  name: string;
  requiredHeaders: string[];
  validateRow(row: CsvRow, index: number): { parsed: T | null; errors: FieldError[] };
}

export interface ImportWriter<T> {
  insert(
    db: D1Database,
    organizationId: string,
    createdBy: string,
    rows: { index: number; parsed: T }[],
  ): Promise<InsertResult>;
}

export interface InsertResult {
  inserted: number;
  errors: ImportError[];
  /** IDs of created entities (for undo tracking) */
  createdIds?: string[];
}

export async function previewImport<T>(
  csvText: string,
  validator: ImportValidator<T>,
): Promise<ImportPreview<T>> {
  const { headers, rows } = parseCsv(csvText);
  const missingHeaders = validator.requiredHeaders.filter((h) => !headers.includes(h));

  const dataRows = csvRowsToObjects(headers, rows);

  const previews: ImportRowPreview<T>[] = [];
  const errors: ImportError[] = [];

  if (missingHeaders.length > 0) {
    errors.push({ row: 0, field: "_header", message: `Header tidak ditemukan: ${missingHeaders.join(", ")}` });
  }

  for (let i = 0; i < dataRows.length; i++) {
    const result = validator.validateRow(dataRows[i], i);
    previews.push({
      index: i,
      row: dataRows[i],
      parsed: result.parsed,
      errors: result.errors,
    });
    for (const fe of result.errors) {
      errors.push({ row: i + 1, field: fe.field, message: fe.message });
    }
  }

  const validCount = previews.filter((p) => p.parsed !== null).length;
  return {
    headers,
    totalRows: dataRows.length,
    validRows: validCount,
    errorRows: dataRows.length - validCount,
    rows: previews,
    errors,
  };
}

export async function executeImport<T>(
  db: D1Database,
  organizationId: string,
  createdBy: string,
  csvText: string,
  validator: ImportValidator<T>,
  writer: ImportWriter<T>,
  importType: string,
): Promise<ImportResult> {
  const preview = await previewImport(csvText, validator);

  if (preview.errorRows > 0) {
    return {
      id: "",
      organizationId,
      importType,
      totalRows: preview.totalRows,
      insertedRows: 0,
      errorRows: preview.errorRows,
      errors: preview.errors,
      createdBy,
      createdAt: Date.now(),
    };
  }

  const validRows = preview.rows
    .filter((r): r is ImportRowPreview<T> & { parsed: T } => r.parsed !== null)
    .map((r) => ({ index: r.index, parsed: r.parsed }));

  const result = await writer.insert(db, organizationId, createdBy, validRows);

  const importId = generateId();

  await execute(
    db,
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, after_json, created_at)
     VALUES (?, ?, ?, 'import', ?, 'import_executed', ?, ?)`,
    [
      generateId(),
      organizationId,
      createdBy,
      importId,
      JSON.stringify({ importType, totalRows: preview.totalRows, inserted: result.inserted, errors: result.errors.length, createdIds: result.createdIds }),
      Date.now(),
    ],
  );

  return {
    id: importId,
    organizationId,
    importType,
    totalRows: preview.totalRows,
    insertedRows: result.inserted,
    errorRows: result.errors.length,
    errors: result.errors,
    createdBy,
    createdAt: Date.now(),
  };
}

export function validateRequiredField(
  row: CsvRow,
  field: string,
  errors: FieldError[],
): string | null {
  const val = row[field]?.trim();
  if (!val) {
    errors.push({ field, message: `${field} harus diisi` });
    return null;
  }
  return val;
}

export function validateOptionalField(row: CsvRow, field: string): string | null {
  return row[field]?.trim() || null;
}

export function validateIntegerField(
  row: CsvRow,
  field: string,
  errors: FieldError[],
  min?: number,
): number | null {
  const val = row[field]?.trim();
  if (!val) return null;
  const n = parseInt(val, 10);
  if (isNaN(n) || (min !== undefined && n < min)) {
    errors.push({ field, message: `${field} harus berupa angka${min !== undefined ? ` minimal ${min}` : ""}` });
    return null;
  }
  return n;
}

export function validateEnumField<T extends string>(
  row: CsvRow,
  field: string,
  allowed: readonly T[],
  errors: FieldError[],
): T | null {
  const val = row[field]?.trim() as T;
  if (!val) {
    errors.push({ field, message: `${field} harus diisi` });
    return null;
  }
  if (!allowed.includes(val)) {
    errors.push({ field, message: `${field} harus salah satu dari: ${allowed.join(", ")}` });
    return null;
  }
  return val;
}

export interface UndoResult {
  importId: string;
  importType: string;
  undoneRows: number;
  success: boolean;
  message: string;
}

/**
 * Undo a previously executed import by its audit-logged import ID.
 * Deletes the entities that were created during the import.
 *
 * Supported import types: coa_import, product_import, party_import, opening_balance_import
 */
export async function undoImport(
  db: D1Database,
  organizationId: string,
  importId: string,
): Promise<UndoResult> {
  // Find the import audit log entry
  const logEntry = await db.prepare(
    `SELECT after_json, entity_type FROM audit_logs
     WHERE organization_id = ? AND entity_id = ? AND action = 'import_executed'
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(organizationId, importId).first<{ after_json: string; entity_type: string }>();

  if (!logEntry) {
    return {
      importId,
      importType: "unknown",
      undoneRows: 0,
      success: false,
      message: "Import tidak ditemukan atau sudah dibatalkan",
    };
  }

  const after = JSON.parse(logEntry.after_json) as {
    importType: string;
    createdIds?: string[];
  };

  const importType = after.importType;
  const createdIds = after.createdIds;

  if (!createdIds || createdIds.length === 0) {
    return {
      importId,
      importType,
      undoneRows: 0,
      success: false,
      message: "Import ini tidak memiliki data yang bisa dibatalkan",
    };
  }

  let undoneRows = 0;

  switch (importType) {
    case "coa_import": {
      // Soft-delete: set is_active = 0
      for (const id of createdIds) {
        await db.prepare(
          `UPDATE accounts SET is_active = 0, updated_at = ? WHERE id = ? AND organization_id = ?`,
        ).bind(Date.now(), id, organizationId).run();
        undoneRows++;
      }
      break;
    }
    case "product_import": {
      for (const id of createdIds) {
        await db.prepare(
          `UPDATE products SET is_active = 0, updated_at = ? WHERE id = ? AND organization_id = ?`,
        ).bind(Date.now(), id, organizationId).run();
        undoneRows++;
      }
      break;
    }
    case "party_import": {
      for (const id of createdIds) {
        await db.prepare(
          `UPDATE parties SET is_active = 0, updated_at = ? WHERE id = ? AND organization_id = ?`,
        ).bind(Date.now(), id, organizationId).run();
        undoneRows++;
      }
      break;
    }
    case "opening_balance_import": {
      // Delete journal lines + journal entry
      for (const id of createdIds) {
        await db.prepare(
          `DELETE FROM journal_lines WHERE journal_entry_id = ? AND organization_id = ?`,
        ).bind(id, organizationId).run();
        await db.prepare(
          `DELETE FROM journal_entries WHERE id = ? AND organization_id = ?`,
        ).bind(id, organizationId).run();
        undoneRows++;
      }
      break;
    }
    default: {
      return {
        importId,
        importType,
        undoneRows: 0,
        success: false,
        message: `Tipe import "${importType}" tidak mendukung pembatalan`,
      };
    }
  }

  // Mark the audit log entry as undone
  const updatedAfter = { ...after, undoneAt: Date.now(), undone: true };
  await db.prepare(
    `UPDATE audit_logs SET after_json = ? WHERE organization_id = ? AND entity_id = ? AND action = 'import_executed'`,
  ).bind(JSON.stringify(updatedAfter), organizationId, importId).run();

  return {
    importId,
    importType,
    undoneRows,
    success: true,
    message: `Berhasil membatalkan ${undoneRows} baris data ${importType}`,
  };
}
