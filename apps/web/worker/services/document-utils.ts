/**
 * Shared utilities for document and invoice services.
 * Extracted to reduce duplication between documents.service.ts and invoices.service.ts.
 */

import { generateId } from "../auth/tokens";
import { execute, queryFirst } from "../db/client";
import { badRequest } from "../http/errors";

/**
 * Generate the next sequential number using organization_document_counters.
 * Used by both documents.service.ts and invoices.service.ts.
 */
export async function nextSequentialNumber(
  db: D1Database,
  organizationId: string,
  counterName: string,
  prefix: string,
  padLength = 6,
): Promise<string> {
  const row = await queryFirst<{ current_value: number }>(
    db,
    `SELECT current_value FROM organization_document_counters
     WHERE organization_id = ? AND counter_name = ?
     FOR UPDATE`,
    [organizationId, counterName],
  );

  const nextVal = (row?.current_value ?? 0) + 1;

  await execute(
    db,
    `INSERT INTO organization_document_counters (organization_id, counter_name, current_value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(organization_id, counter_name) DO UPDATE SET current_value = ?, updated_at = ?`,
    [organizationId, counterName, nextVal, Date.now(), nextVal, Date.now()],
  );

  return `${prefix}-${String(nextVal).padStart(padLength, "0")}`;
}

/**
 * Compute subtotal and total from line items with discount and tax.
 * Used by both invoices.service.ts and documents.service.ts.
 */
const MAX_LINE_ITEMS = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_MONEY_MINOR = 999_999_999_999;
const MAX_QUANTITY_MILLI = 999_999_999_000;

/**
 * Validate document/invoice line items.
 * Throws badRequest if any constraint is violated.
 */
export function validateLines(
  lines: { description: string; quantityMilli: number; unitPriceMinor: number; amountMinor: number }[],
): void {
  if (lines.length === 0) {
    throw badRequest("no_lines", "Setidaknya satu item diperlukan");
  }
  if (lines.length > MAX_LINE_ITEMS) {
    throw badRequest("too_many_lines", `Maksimal ${MAX_LINE_ITEMS} item per dokumen`);
  }
  for (const l of lines) {
    if (l.description && l.description.length > MAX_DESCRIPTION_LENGTH) {
      throw badRequest("description_too_long", `Deskripsi item maksimal ${MAX_DESCRIPTION_LENGTH} karakter`);
    }
    if (!Number.isFinite(l.quantityMilli) || l.quantityMilli <= 0) {
      throw badRequest("invalid_quantity", "Jumlah harus lebih dari 0");
    }
    if (l.quantityMilli > MAX_QUANTITY_MILLI) {
      throw badRequest("quantity_overflow", `Jumlah tidak boleh melebihi 999.999.999`);
    }
    if (!Number.isFinite(l.unitPriceMinor) || l.unitPriceMinor < 0) {
      throw badRequest("invalid_unit_price", "Harga satuan tidak boleh negatif");
    }
    if (l.unitPriceMinor > MAX_MONEY_MINOR) {
      throw badRequest("unit_price_overflow", `Harga satuan tidak boleh melebihi ${MAX_MONEY_MINOR}`);
    }
    if (!Number.isFinite(l.amountMinor) || l.amountMinor < 0) {
      throw badRequest("invalid_amount", "Jumlah tidak boleh negatif");
    }
    if (l.amountMinor > MAX_MONEY_MINOR) {
      throw badRequest("amount_overflow", `Jumlah tidak boleh melebihi ${MAX_MONEY_MINOR}`);
    }
  }
}

/**
 * Validate optional text fields (notes, terms).
 */
export function checkOptionalText(value: string | null | undefined, maxLength: number, field: string): string | undefined {
  const text = value?.trim();
  if (text && text.length > maxLength) {
    throw badRequest(`${field}_too_long`, `${field} maksimal ${maxLength} karakter`);
  }
  return text || undefined;
}

export function computeTotals(
  lines: { amountMinor: number }[],
  discountMinor = 0,
  taxMinor = 0,
): { subtotalMinor: number; totalMinor: number } {
  const subtotalMinor = lines.reduce((s, l) => s + l.amountMinor, 0);
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + taxMinor);
  return { subtotalMinor, totalMinor };
}

/**
 * Build INSERT statements for invoice/document line items.
 * Shared pattern across invoices and business documents.
 */
export function buildLineInserts(
  db: D1Database,
  organizationId: string,
  parentId: string,
  lines: { productId?: string; description: string; quantityMilli: number; unitPriceMinor: number; amountMinor: number }[],
  tableName: "invoice_lines" | "document_lines",
  parentColumn: "invoice_id" | "document_id",
  now: number,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const id = generateId();
    statements.push(
      db.prepare(
        `INSERT INTO ${tableName} (id, organization_id, ${parentColumn}, product_id, description, quantity_milli, unit_price_minor, amount_minor, line_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, organizationId, parentId,
        l.productId ?? null, l.description,
        l.quantityMilli, l.unitPriceMinor, l.amountMinor, i + 1, now,
      ),
    );
  }
  return statements;
}
