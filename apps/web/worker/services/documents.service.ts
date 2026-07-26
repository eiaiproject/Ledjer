// ponytail: Shared business documents service for P2.4.
// Supports quotation, purchase_order, delivery_note, payment_receipt,
// cash_receipt, cash_payment_voucher, return_note.
// Invoices use their own service (invoices.service.ts).
//
// Key design decisions:
// - Single table for all document types with discriminator (document_type)
// - Document counters in organization_document_counters (counter_name = doc_{type})
// - No automatic financial posting — documents are operational records
// - Convert operations create linked documents without duplicating postings
// - Traceable via reference_document_type + reference_document_id

import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst, type D1Input } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, notFound } from "../http/errors";
import { nextSequentialNumber, computeTotals, buildLineInserts } from "./document-utils";

export type DocumentType =
  | "quotation"
  | "purchase_order"
  | "delivery_note"
  | "payment_receipt"
  | "cash_receipt"
  | "cash_payment_voucher"
  | "return_note";

export type DocumentStatus =
  | "draft"
  | "confirmed"
  | "issued"
  | "sent"
  | "partially_received"
  | "received"
  | "cancelled"
  | "converted";

export interface DocumentLine {
  productId?: string;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface CreateDocumentInput {
  documentType: DocumentType;
  documentDate: string;
  partyId?: string;
  lines: DocumentLine[];
  discountMinor?: number;
  taxMinor?: number;
  notes?: string;
  terms?: string;
  deliveryDate?: string;
  paymentMethod?: string;
  paymentReference?: string;
  /** Optional link to a source document (e.g. quotation → invoice) */
  referenceDocumentType?: string;
  referenceDocumentId?: string;
}

export interface DocumentOutput {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  documentDate: string;
  partyId: string | null;
  status: DocumentStatus;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: DocumentLineOutput[];
  notes: string | null;
  terms: string | null;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  deliveryDate: string | null;
  receivedBy: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  voidReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DocumentLineOutput {
  id: string;
  productId: string | null;
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  amountMinor: number;
  lineOrder: number;
}

// ---------------------------------------------------------------------------
// Document number helpers
// ---------------------------------------------------------------------------

const DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  quotation: "QOT",
  purchase_order: "PO",
  delivery_note: "DN",
  payment_receipt: "PR",
  cash_receipt: "CR",
  cash_payment_voucher: "CPV",
  return_note: "RN",
};

async function nextDocumentNumber(
  db: D1Database,
  organizationId: string,
  documentType: DocumentType,
): Promise<string> {
  const counterName = `doc_${documentType}`;
  const prefix = DOCUMENT_PREFIXES[documentType];
  return nextSequentialNumber(db, organizationId, counterName, prefix);
}

// ---------------------------------------------------------------------------
// Allowed status transitions per document type
// ---------------------------------------------------------------------------

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["issued", "sent", "cancelled"],
  issued: ["sent", "partially_received", "received", "cancelled", "converted"],
  sent: ["partially_received", "received", "cancelled", "converted"],
  partially_received: ["received", "cancelled"],
  received: ["cancelled"],
  cancelled: [],
  converted: [],
};

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function createDocument(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreateDocumentInput,
): Promise<DocumentOutput> {
  if (input.lines.length === 0) {
    throw badRequest("no_lines", "Setidaknya satu item diperlukan");
  }

  const docId = generateId();
  const now = Date.now();
  const docNumber = await nextDocumentNumber(db, organizationId, input.documentType);
  const { subtotalMinor, totalMinor } = computeTotals(
    input.lines,
    input.discountMinor,
    input.taxMinor,
  );

  const statements: D1PreparedStatement[] = [];

  statements.push(
    db.prepare(
      `INSERT INTO business_documents (
         id, organization_id, document_type, document_number, document_date,
         party_id, status, subtotal_minor, discount_minor, tax_minor, total_minor,
         notes, terms,
         reference_document_type, reference_document_id,
         delivery_date, payment_method, payment_reference,
         created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      docId, organizationId, input.documentType, docNumber, input.documentDate,
      input.partyId ?? null,
      subtotalMinor, input.discountMinor ?? 0, input.taxMinor ?? 0, totalMinor,
      input.notes ?? null, input.terms ?? null,
      input.referenceDocumentType ?? null, input.referenceDocumentId ?? null,
      input.deliveryDate ?? null, input.paymentMethod ?? null, input.paymentReference ?? null,
      userId, now, now,
    ),
  );

  statements.push(...buildLineInserts(db, organizationId, docId, input.lines, "document_lines", "document_id", now));

  statements.push(writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "document",
    entityId: docId,
    action: "create",
    after: { documentType: input.documentType, documentNumber: docNumber, totalMinor },
    current: now,
  }));

  await executeBatch(db, statements);

  return {
    id: docId,
    documentType: input.documentType,
    documentNumber: docNumber,
    documentDate: input.documentDate,
    partyId: input.partyId ?? null,
    status: "draft",
    subtotalMinor,
    discountMinor: input.discountMinor ?? 0,
    taxMinor: input.taxMinor ?? 0,
    totalMinor,
    lines: input.lines.map((l, i) => ({
      id: "",
      productId: l.productId ?? null,
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPriceMinor: l.unitPriceMinor,
      amountMinor: l.amountMinor,
      lineOrder: i + 1,
    })),
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    referenceDocumentType: input.referenceDocumentType ?? null,
    referenceDocumentId: input.referenceDocumentId ?? null,
    deliveryDate: input.deliveryDate ?? null,
    receivedBy: null,
    paymentMethod: input.paymentMethod ?? null,
    paymentReference: input.paymentReference ?? null,
    voidReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getDocument(
  db: D1Database,
  organizationId: string,
  documentId: string,
): Promise<DocumentOutput | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM business_documents WHERE id = ? AND organization_id = ?`,
    [documentId, organizationId],
  );
  if (!row) return null;

  const lines = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM document_lines WHERE document_id = ? ORDER BY line_order`,
    [documentId],
  );

  return rowToDocumentOutput(row, lines);
}

export async function getDocumentByNumber(
  db: D1Database,
  organizationId: string,
  documentType: DocumentType,
  documentNumber: string,
): Promise<DocumentOutput | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM business_documents
     WHERE organization_id = ? AND document_type = ? AND document_number = ?`,
    [organizationId, documentType, documentNumber],
  );
  if (!row) return null;

  const lines = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM document_lines WHERE document_id = ? ORDER BY line_order`,
    [row.id as string],
  );

  return rowToDocumentOutput(row, lines);
}

export async function listDocuments(
  db: D1Database,
  organizationId: string,
  documentType?: DocumentType,
  limit = 50,
  offset = 0,
): Promise<{ documents: DocumentOutput[]; total: number }> {
  const typeFilter = documentType ? "AND document_type = ?" : "";
  const params: D1Input[] = documentType
    ? [organizationId, documentType, limit, offset]
    : [organizationId, limit, offset];

  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM business_documents
     WHERE organization_id = ? ${typeFilter}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    params,
  );

  const totalRow = await queryFirst<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM business_documents WHERE organization_id = ? ${typeFilter}`,
    documentType ? [organizationId, documentType] : [organizationId],
  );

  const documents: DocumentOutput[] = [];
  for (const row of rows) {
    const lines = await queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM document_lines WHERE document_id = ? ORDER BY line_order`,
      [row.id as string],
    );
    documents.push(rowToDocumentOutput(row, lines));
  }

  return { documents, total: totalRow?.cnt ?? 0 };
}

export async function updateDocumentStatus(
  db: D1Database,
  organizationId: string,
  userId: string,
  documentId: string,
  newStatus: string,
  reason?: string,
): Promise<DocumentOutput> {
  const doc = await getDocument(db, organizationId, documentId);
  if (!doc) throw notFound("document_not_found", "Dokumen tidak ditemukan");

  const allowed = STATUS_TRANSITIONS[doc.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw badRequest(
      "invalid_status_transition",
      `Tidak bisa mengubah status dari "${doc.status}" ke "${newStatus}"`,
    );
  }

  const now = Date.now();
  const voidedAt = newStatus === "cancelled" ? now : null;
  const voidReason = newStatus === "cancelled" ? (reason ?? null) : null;

  await execute(
    db,
    `UPDATE business_documents
     SET status = ?, voided_at = ?, void_reason = ?, updated_at = ?
     WHERE id = ? AND organization_id = ?`,
    [newStatus, voidedAt, voidReason, now, documentId, organizationId],
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "business_document",
    entityId: documentId,
    action: "status_changed",
    before: { status: doc.status },
    after: { status: newStatus },
    reason: reason ?? null,
    current: now,
  });

  return { ...doc, status: newStatus as DocumentStatus };
}

// ---------------------------------------------------------------------------
// Type-specific operations
// ---------------------------------------------------------------------------

/**
 * Convert a quotation to an invoice.
 * Does NOT duplicate financial postings — creates the invoice as draft.
 */
export async function convertQuotationToInvoice(
  db: D1Database,
  organizationId: string,
  userId: string,
  quotationId: string,
  invoiceService: {
    createInvoice: (
      db: D1Database,
      orgId: string,
      userId: string,
      input: { invoiceDate: string; dueDate: string; partyId: string; lines: {
        productId?: string; description: string; quantityMilli: number;
        unitPriceMinor: number; amountMinor: number;
      }[]; discountMinor?: number; taxMinor?: number; notes?: string; terms?: string;
      },
    ) => Promise<{ id: string }>;
  },
): Promise<{ quotationId: string; invoiceId: string }> {
  const quotation = await getDocument(db, organizationId, quotationId);
  if (!quotation) throw notFound("quotation_not_found", "Penawaran tidak ditemukan");
  if (quotation.documentType !== "quotation") {
    throw badRequest("invalid_document_type", "Dokumen bukan penawaran");
  }
  if (quotation.status !== "issued" && quotation.status !== "sent") {
    throw badRequest(
      "invalid_status",
      `Hanya penawaran berstatus "issued" atau "sent" yang bisa dikonversi. Status saat ini: "${quotation.status}"`,
    );
  }
  if (!quotation.partyId) {
    throw badRequest("no_party", "Penawaran harus memiliki pelanggan untuk dikonversi ke faktur");
  }

  // Mark quotation as converted
  await updateDocumentStatus(db, organizationId, userId, quotationId, "converted");

  // Create invoice from quotation data
  const invoice = await invoiceService.createInvoice(db, organizationId, userId, {
    invoiceDate: quotation.documentDate,
    dueDate: quotation.documentDate, // same date by default; user can edit
    partyId: quotation.partyId,
    lines: quotation.lines.map((l) => ({
      productId: l.productId ?? undefined,
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPriceMinor: l.unitPriceMinor,
      amountMinor: l.amountMinor,
    })),
    discountMinor: quotation.discountMinor,
    taxMinor: quotation.taxMinor,
    notes: quotation.notes ?? undefined,
    terms: quotation.terms ?? undefined,
  });

  return { quotationId, invoiceId: invoice.id };
}

/**
 * Convert a purchase_order to a delivery_note (goods received).
 */
export async function convertPurchaseOrderToDeliveryNote(
  db: D1Database,
  organizationId: string,
  userId: string,
  purchaseOrderId: string,
): Promise<{ purchaseOrderId: string; deliveryNoteId: string }> {
  const po = await getDocument(db, organizationId, purchaseOrderId);
  if (!po) throw notFound("po_not_found", "Pesanan pembelian tidak ditemukan");
  if (po.documentType !== "purchase_order") {
    throw badRequest("invalid_document_type", "Dokumen bukan pesanan pembelian");
  }
  if (po.status !== "issued" && po.status !== "sent") {
    throw badRequest(
      "invalid_status",
      `Hanya PO berstatus "issued" atau "sent" yang bisa diterima. Status saat ini: "${po.status}"`,
    );
  }

  // Create delivery note referencing the PO
  const dnInput: CreateDocumentInput = {
    documentType: "delivery_note",
    documentDate: new Date().toISOString().slice(0, 10),
    partyId: po.partyId ?? undefined,
    lines: po.lines.map((l) => ({
      productId: l.productId ?? undefined,
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPriceMinor: l.unitPriceMinor,
      amountMinor: l.amountMinor,
    })),
    notes: `Diterima dari PO ${po.documentNumber}: ${po.notes ?? ""}`.trim(),
    referenceDocumentType: "purchase_order",
    referenceDocumentId: purchaseOrderId,
  };

  const dn = await createDocument(db, organizationId, userId, dnInput);

  // Update PO status
  await updateDocumentStatus(db, organizationId, userId, purchaseOrderId, "received");

  return { purchaseOrderId, deliveryNoteId: dn.id };
}

// ---------------------------------------------------------------------------
// Row → Output helper
// ---------------------------------------------------------------------------

function rowToDocumentOutput(
  row: Record<string, unknown>,
  lines: Record<string, unknown>[],
): DocumentOutput {
  return {
    id: row.id as string,
    documentType: row.document_type as DocumentType,
    documentNumber: row.document_number as string,
    documentDate: row.document_date as string,
    partyId: row.party_id as string | null,
    status: row.status as DocumentStatus,
    subtotalMinor: row.subtotal_minor as number,
    discountMinor: row.discount_minor as number,
    taxMinor: row.tax_minor as number,
    totalMinor: row.total_minor as number,
    lines: lines.map((l) => ({
      id: l.id as string,
      productId: l.product_id as string | null,
      description: l.description as string,
      quantityMilli: l.quantity_milli as number,
      unitPriceMinor: l.unit_price_minor as number,
      amountMinor: l.amount_minor as number,
      lineOrder: l.line_order as number,
    })),
    notes: row.notes as string | null,
    terms: row.terms as string | null,
    referenceDocumentType: row.reference_document_type as string | null,
    referenceDocumentId: row.reference_document_id as string | null,
    deliveryDate: row.delivery_date as string | null,
    receivedBy: row.received_by as string | null,
    paymentMethod: row.payment_method as string | null,
    paymentReference: row.payment_reference as string | null,
    voidReason: row.void_reason as string | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
