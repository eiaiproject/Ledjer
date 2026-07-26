/**
 * Shared utilities for document and invoice services.
 * Extracted to reduce duplication between documents.service.ts and invoices.service.ts.
 */

import { generateId } from "../auth/tokens";
import { execute, queryFirst } from "../db/client";

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
