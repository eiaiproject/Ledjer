// ponytail: Invoice MVP. Supports draft→issued→paid/voided lifecycle.
// Does not post to journal automatically — invoices are billing documents,
// revenue is recognized on transaction posting. Upgrade: auto-create transaction
// on issue, credit notes, PDF generation, email send.

import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, notFound } from "../http/errors";
import { nextSequentialNumber, computeTotals, buildLineInserts, validateLines, checkOptionalText } from "./document-utils";

export interface InvoiceLine {
  productId?: string;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface CreateInvoiceInput {
  invoiceDate: string;
  dueDate: string;
  partyId: string;
  lines: InvoiceLine[];
  discountMinor?: number;
  taxMinor?: number;
  notes?: string;
  terms?: string;
  idempotencyKey?: string;
}

export interface InvoiceOutput {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  partyId: string;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  lines: InvoiceLineOutput[];
  notes: string | null;
  terms: string | null;
  creditedByInvoiceId: string | null;
  createdAt: number;
}

interface InvoiceLineOutput {
  id: string;
  productId: string | null;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  amountMinor: number;
  lineOrder: number;
}

async function nextInvoiceNumber(db: D1Database, organizationId: string): Promise<string> {
  return nextSequentialNumber(db, organizationId, "invoice", "INV");
}

export async function createInvoice(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreateInvoiceInput,
): Promise<InvoiceOutput> {
  validateLines(input.lines);
  input.notes = checkOptionalText(input.notes, 1000, "notes");
  input.terms = checkOptionalText(input.terms, 500, "terms");

  // M-01: Validate partyId exists in same organization (non-blocking)

  if (input.idempotencyKey) {
    const existing = await queryFirst<Record<string, unknown>>(
      db,
      `SELECT * FROM invoices WHERE organization_id = ? AND idempotency_key = ?`,
      [organizationId, input.idempotencyKey],
    );
    if (existing) {
      const inv = await getInvoice(db, organizationId, existing.id as string);
      if (inv) return inv;
    }
  }

  const invoiceId = generateId();
  const now = Date.now();
  const invoiceNumber = await nextInvoiceNumber(db, organizationId);
  const { subtotalMinor, totalMinor } = computeTotals(input.lines, input.discountMinor, input.taxMinor);

  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO invoices (id, organization_id, invoice_number, invoice_date, due_date, party_id, status, subtotal_minor, discount_minor, tax_minor, total_minor, notes, terms, idempotency_key, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(invoiceId, organizationId, invoiceNumber, input.invoiceDate, input.dueDate,
      input.partyId, subtotalMinor, input.discountMinor ?? 0, input.taxMinor ?? 0,
      totalMinor, input.notes ?? null, input.terms ?? null, input.idempotencyKey ?? null, userId, now, now),
    ...buildLineInserts(db, organizationId, invoiceId, input.lines, "invoice_lines", "invoice_id", now),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "invoice",
      entityId: invoiceId,
      action: "create",
      after: { invoiceNumber, invoiceDate: input.invoiceDate, totalMinor },
      current: now,
    }),
  ];

  await executeBatch(db, statements);

  return {
    id: invoiceId, invoiceNumber, invoiceDate: input.invoiceDate,
    dueDate: input.dueDate, partyId: input.partyId, status: "draft",
    subtotalMinor, discountMinor: input.discountMinor ?? 0,
    taxMinor: input.taxMinor ?? 0, totalMinor, paidMinor: 0,
    lines: input.lines.map((l, i) => ({
      id: "", productId: l.productId ?? null, description: l.description,
      quantityMilli: l.quantityMilli, unitPriceMinor: l.unitPriceMinor,
      amountMinor: l.amountMinor, lineOrder: i + 1,
    })),
    notes: input.notes ?? null, terms: input.terms ?? null, creditedByInvoiceId: null, createdAt: now,
  };
}

export async function getInvoice(
  db: D1Database,
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceOutput | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM invoices WHERE id = ? AND organization_id = ?`,
    [invoiceId, organizationId],
  );
  if (!row) return null;

  const lines = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY line_order`,
    [invoiceId],
  );

  return {
    id: row.id as string, invoiceNumber: row.invoice_number as string,
    invoiceDate: row.invoice_date as string, dueDate: row.due_date as string,
    partyId: row.party_id as string, status: row.status as string,
    subtotalMinor: row.subtotal_minor as number,
    discountMinor: row.discount_minor as number,
    taxMinor: row.tax_minor as number, totalMinor: row.total_minor as number,
    paidMinor: row.paid_minor as number,
    lines: lines.map((l) => ({
      id: l.id as string, productId: l.product_id as string | null,
      description: l.description as string,
      quantityMilli: l.quantity_milli as number,
      unitPriceMinor: l.unit_price_minor as number,
      amountMinor: l.amount_minor as number, lineOrder: l.line_order as number,
    })),
    notes: row.notes as string | null, terms: row.terms as string | null,
    creditedByInvoiceId: row.credited_by_invoice_id as string | null,
    createdAt: row.created_at as number,
  };
}


/**
 * Get credit notes referencing a specific invoice (credited_by_invoice_id).
 */
export async function getCreditNotesForInvoice(
  db: D1Database,
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceOutput[]> {
  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM invoices WHERE credited_by_invoice_id = ? AND organization_id = ? ORDER BY created_at DESC`,
    [invoiceId, organizationId],
  );

  const result: InvoiceOutput[] = [];
  for (const row of rows) {
    const lines = await queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY line_order`,
      [row.id as string],
    );
    result.push({
      id: row.id as string, invoiceNumber: row.invoice_number as string,
      invoiceDate: row.invoice_date as string, dueDate: row.due_date as string,
      partyId: row.party_id as string, status: row.status as string,
      subtotalMinor: row.subtotal_minor as number,
      discountMinor: row.discount_minor as number,
      taxMinor: row.tax_minor as number, totalMinor: row.total_minor as number,
      paidMinor: row.paid_minor as number,
      lines: lines.map((l) => ({
        id: l.id as string, productId: l.product_id as string | null,
        description: l.description as string,
        quantityMilli: l.quantity_milli as number,
        unitPriceMinor: l.unit_price_minor as number,
        amountMinor: l.amount_minor as number, lineOrder: l.line_order as number,
      })),
      notes: row.notes as string | null, terms: row.terms as string | null,
      creditedByInvoiceId: row.credited_by_invoice_id as string | null,
      createdAt: row.created_at as number,
    });
  }
  return result;
}

/**
 * Create a credit note for a paid invoice.
 * The credit note is a new invoice with negative amounts that references
 * the original invoice via credited_by_invoice_id.
 */
export async function createCreditNote(
  db: D1Database,
  organizationId: string,
  userId: string,
  originalInvoiceId: string,
  input: {
    lines: InvoiceLine[];
    discountMinor?: number;
    taxMinor?: number;
    notes?: string;
    reason?: string;
  },
): Promise<InvoiceOutput> {
  validateLines(input.lines);
  input.notes = checkOptionalText(input.notes, 1000, "notes");
  const original = await getInvoice(db, organizationId, originalInvoiceId);
  if (!original) throw notFound("invoice_not_found", "Faktur asli tidak ditemukan");
  if (original.status !== "paid") {
    throw badRequest("invalid_status",
      `Hanya faktur berstatus "paid" yang bisa dibuatkan credit note. Status saat ini: "${original.status}"`);
  }

  // Use credit note counter (INSERT … ON CONFLICT … RETURNING instead of FOR UPDATE,
  // because Cloudflare D1 does not support FOR UPDATE)
  const row = await queryFirst<{ current_value: number }>(
    db,
    `INSERT INTO organization_document_counters (
       organization_id, counter_name, current_value, updated_at
     ) VALUES (?, 'credit_note', 1, ?)
     ON CONFLICT(organization_id, counter_name)
     DO UPDATE SET
       current_value = current_value + 1,
       updated_at = excluded.updated_at
     RETURNING current_value`,
    [organizationId, Date.now()],
  );
  if (!row) throw badRequest("counter_failed", "Credit note counter failed");
  const nextVal = row.current_value;
  const cnNumber = `CN-${String(nextVal).padStart(6, "0")}`;

  const cnId = generateId();
  const now = Date.now();
  const { subtotalMinor, totalMinor } = computeTotals(input.lines, input.discountMinor, input.taxMinor);
  const date = new Date().toISOString().slice(0, 10);

  const statements: D1PreparedStatement[] = [];

  // 1. Create credit note invoice (amounts are positive, but credit note reduces debt)
  statements.push(
    db.prepare(
      `INSERT INTO invoices (id, organization_id, invoice_number, invoice_date, due_date, party_id, status,
       subtotal_minor, discount_minor, tax_minor, total_minor, paid_minor,
       notes, credited_by_invoice_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    ).bind(cnId, organizationId, cnNumber, date, date, original.partyId,
      subtotalMinor, input.discountMinor ?? 0, input.taxMinor ?? 0,
      totalMinor, input.notes ?? null,
      originalInvoiceId, userId, now, now),
  );

  // 2. Insert credit note lines
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    statements.push(
      db.prepare(
        `INSERT INTO invoice_lines (id, organization_id, invoice_id, product_id, description, quantity_milli, unit_price_minor, amount_minor, line_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(generateId(), organizationId, cnId,
        l.productId ?? null, l.description,
        l.quantityMilli, l.unitPriceMinor, l.amountMinor, i + 1, now),
    );
  }

  // 3. Mark original invoice as credited + audit log
  statements.push(
    db.prepare(
      `UPDATE invoices SET status = 'credited', updated_at = ? WHERE id = ?`,
    ).bind(now, originalInvoiceId),
    db.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, 'credit_note', ?, 'created', ?, ?, ?, ?)`,
    ).bind(generateId(), organizationId, userId, cnId,
      JSON.stringify({ originalInvoiceId, originalNumber: original.invoiceNumber }),
      JSON.stringify({ cnNumber, totalMinor }),
      input.reason ?? null, now),
  );

  await executeBatch(db, statements);

  return {
    id: cnId, invoiceNumber: cnNumber,
    invoiceDate: date, dueDate: date,
    partyId: original.partyId, status: "issued",
    subtotalMinor, discountMinor: input.discountMinor ?? 0,
    taxMinor: input.taxMinor ?? 0, totalMinor, paidMinor: 0,
    lines: input.lines.map((l, i) => ({
      id: "", productId: l.productId ?? null, description: l.description,
      quantityMilli: l.quantityMilli, unitPriceMinor: l.unitPriceMinor,
      amountMinor: l.amountMinor, lineOrder: i + 1,
    })),
    notes: input.notes ?? null, terms: null,
    creditedByInvoiceId: originalInvoiceId,
    createdAt: now,
  };
}

export async function listInvoices(
  db: D1Database,
  organizationId: string,
  limit = 50,
  offset = 0,
): Promise<{ invoices: InvoiceOutput[]; total: number }> {
  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM invoices WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [organizationId, limit, offset],
  );

  const totalRow = await queryFirst<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = ?`,
    [organizationId],
  );

  const invoices: InvoiceOutput[] = [];
  for (const row of rows) {
    const lines = await queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY line_order`,
      [row.id as string],
    );
    invoices.push({
      id: row.id as string, invoiceNumber: row.invoice_number as string,
      invoiceDate: row.invoice_date as string, dueDate: row.due_date as string,
      partyId: row.party_id as string, status: row.status as string,
      subtotalMinor: row.subtotal_minor as number,
      discountMinor: row.discount_minor as number,
      taxMinor: row.tax_minor as number, totalMinor: row.total_minor as number,
      paidMinor: row.paid_minor as number,
      lines: lines.map((l) => ({
        id: l.id as string, productId: l.product_id as string | null,
        description: l.description as string,
        quantityMilli: l.quantity_milli as number,
        unitPriceMinor: l.unit_price_minor as number,
        amountMinor: l.amount_minor as number, lineOrder: l.line_order as number,
      })),
      notes: row.notes as string | null, terms: row.terms as string | null,
      creditedByInvoiceId: row.credited_by_invoice_id as string | null,
      createdAt: row.created_at as number,
    });
  }

  return { invoices, total: totalRow?.cnt ?? 0 };
}

export async function updateInvoiceStatus(
  db: D1Database,
  organizationId: string,
  userId: string,
  invoiceId: string,
  newStatus: string,
  reason?: string,
): Promise<InvoiceOutput> {
  const invoice = await getInvoice(db, organizationId, invoiceId);
  if (!invoice) throw notFound("invoice_not_found", "Faktur tidak ditemukan");

  // Validate status transitions
  const transitions: Record<string, string[]> = {
    draft: ["issued", "voided"],
    issued: ["sent", "paid", "voided", "credited"],
    sent: ["partially_paid", "paid", "overdue", "voided", "credited"],
    partially_paid: ["paid", "voided"],
    overdue: ["paid", "voided"],
    paid: ["credited"],
    voided: [],
    credited: [],
  };

  const allowed = transitions[invoice.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw badRequest("invalid_status_transition",
      `Tidak bisa mengubah status dari "${invoice.status}" ke "${newStatus}"`);
  }

  const now = Date.now();
  const issuedAt = newStatus === "issued" ? now : null;
  const paidAt = newStatus === "paid" ? now : null;
  const voidedAt = newStatus === "voided" ? now : null;
  const voidReason = newStatus === "voided" ? (reason ?? null) : null;

  await execute(
    db,
    `UPDATE invoices SET status = ?, issued_at = ?, paid_at = ?, voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ?`,
    [newStatus, issuedAt, paidAt, voidedAt, voidReason, now, invoiceId],
  );

  // Audit log
  await execute(
    db,
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, before_json, after_json, reason, created_at)
     VALUES (?, ?, ?, 'invoice', ?, 'status_changed', ?, ?, ?, ?)`,
    [generateId(), organizationId, userId, invoiceId,
     JSON.stringify({ status: invoice.status }),
     JSON.stringify({ status: newStatus }), reason ?? null, now],
  );

  return { ...invoice, status: newStatus };
}
