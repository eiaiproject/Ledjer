import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest, tooManyRequests } from "../http/errors";
import { checkRateLimit } from "../services/rate-limit.service";
import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocumentStatus,
  convertQuotationToInvoice,
  convertPurchaseOrderToDeliveryNote,
  type DocumentType,
} from "../services/documents.service";
import * as invoiceService from "../services/invoices.service";

const app = new Hono<AppContext>();

// ---------------------------------------------------------------------------
// Shared CRUD
// ---------------------------------------------------------------------------

// POST /api/documents — create a document of any type
app.post("/", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  if (await checkRateLimit(c.env.DB, "documents_create", user.id, { max: 20, windowMs: 60000 })) {
    throw tooManyRequests("Too many requests");
  }
  const body = await c.req.json<{
    documentType: string;
    documentDate: string;
    partyId?: string;
    lines: {
      productId?: string;
      description: string;
      quantityMilli?: number;
      unitPriceMinor: number;
      amountMinor: number;
    }[];
    discountMinor?: number;
    taxMinor?: number;
    notes?: string;
    terms?: string;
    deliveryDate?: string;
    paymentMethod?: string;
    paymentReference?: string;
    referenceDocumentType?: string;
    referenceDocumentId?: string;
    idempotencyKey?: string;
  }>();

  if (!body.documentType || !body.documentDate || !body.lines?.length) {
    throw badRequest("invalid_input", "documentType, documentDate, dan lines diperlukan");
  }

  const VALID_TYPES = [
    "quotation", "purchase_order", "delivery_note",
    "payment_receipt", "cash_receipt", "cash_payment_voucher", "return_note",
  ];
  if (!VALID_TYPES.includes(body.documentType)) {
    throw badRequest("invalid_type", `Jenis dokumen tidak valid: ${body.documentType}`);
  }

  const lines = body.lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantityMilli: l.quantityMilli ?? 1000,
    unitPriceMinor: l.unitPriceMinor,
    amountMinor: l.amountMinor,
  }));

  const result = await createDocument(c.env.DB, organization.id, user.id, {
    documentType: body.documentType as DocumentType,
    documentDate: body.documentDate,
    partyId: body.partyId,
    lines,
    discountMinor: body.discountMinor,
    taxMinor: body.taxMinor,
    notes: body.notes,
    idempotencyKey: body.idempotencyKey,
    terms: body.terms,
    deliveryDate: body.deliveryDate,
    paymentMethod: body.paymentMethod,
    paymentReference: body.paymentReference,
    referenceDocumentType: body.referenceDocumentType,
    referenceDocumentId: body.referenceDocumentId,
  });
  return c.json(result, 201);
});

// GET /api/documents — list documents (optional ?type= filter)
app.get("/", requireAuth, loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const docType = c.req.query("type") as DocumentType | undefined;
  const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") || "50", 10), 1), 100);
  const offset = Math.max(Number.parseInt(c.req.query("offset") || "0", 10), 0);
  const result = await listDocuments(c.env.DB, organization.id, docType, limit, offset);
  return c.json(result);
});

// GET /api/documents/:id — get document detail
app.get("/:id", requireAuth, loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const doc = await getDocument(c.env.DB, organization.id, c.req.param("id"));
  if (!doc) return c.json({ error: { code: "not_found", message: "Dokumen tidak ditemukan" } }, 404);
  return c.json(doc);
});

// PATCH /api/documents/:id/status — update document status
app.patch("/:id/status", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{ status: string; reason?: string }>();
  if (!body.status) throw badRequest("invalid_input", "status diperlukan");
  const result = await updateDocumentStatus(
    c.env.DB, organization.id, user.id, c.req.param("id"), body.status, body.reason,
  );
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Type-specific conversions
// ---------------------------------------------------------------------------

// POST /api/documents/:id/convert-to-invoice — quotation → invoice
app.post("/:id/convert-to-invoice", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const result = await convertQuotationToInvoice(
    c.env.DB, organization.id, user.id, c.req.param("id"), invoiceService,
  );
  return c.json(result, 201);
});

// POST /api/documents/:id/receive — purchase_order → delivery_note (goods received)
app.post("/:id/receive", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const result = await convertPurchaseOrderToDeliveryNote(
    c.env.DB, organization.id, user.id, c.req.param("id"),
  );
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// Print view
// ---------------------------------------------------------------------------

// GET /api/documents/:id/print — printable HTML for any document type
app.get("/:id/print", requireAuth, loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const doc = await getDocument(c.env.DB, organization.id, c.req.param("id"));
  if (!doc) return c.json({ error: { code: "not_found", message: "Dokumen tidak ditemukan" } }, 404);

  // Fetch party info
  let party: { name: string; email: string | null; phone: string | null } | null = null;
  if (doc.partyId) {
    party = await c.env.DB.prepare(
      "SELECT name, email, phone FROM parties WHERE id = ?",
    ).bind(doc.partyId).first<{ name: string; email: string | null; phone: string | null }>();
  }

  const DOCUMENT_LABELS: Record<string, string> = {
    quotation: "Penawaran Harga",
    purchase_order: "Pesanan Pembelian",
    delivery_note: "Surat Jalan",
    payment_receipt: "Tanda Terima Pembayaran",
    cash_receipt: "Bukti Kas Masuk",
    cash_payment_voucher: "Bukti Kas Keluar",
    return_note: "Nota Retur",
  };

  const STATUS_LABELS: Record<string, string> = {
    draft: "Draft", confirmed: "Dikonfirmasi", issued: "Diterbitkan",
    sent: "Terkirim", partially_received: "Diterima Sebagian",
    received: "Diterima", cancelled: "Dibatalkan", converted: "Dikonversi",
  };

  const formatRupiah = (n: number) => `Rp ${(n / 100).toLocaleString("id-ID")}`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${doc.documentNumber}</title>
<style>
  @page { margin: 20mm; }
  body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a2e; font-size: 12px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 32px; }
  .title { font-size: 24px; font-weight: 700; color: #1a1a2e; }
  .subtitle { font-size: 13px; color: #888; margin-top: 2px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #e8f5e9; color: #2e7d32; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .meta-item label { display: block; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-item span { font-size: 13px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; padding: 10px 12px; background: #f5f5f5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #e0e0e0; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; }
  .text-right { text-align: right; }
  .totals { margin-left: auto; width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals-total { font-size: 16px; font-weight: 700; border-top: 2px solid #1a1a2e; padding-top: 8px; margin-top: 4px; }
  .notes { margin-top: 24px; padding: 12px; background: #f9f9f9; border-radius: 6px; }
  .ref { margin-top: 16px; padding: 8px 12px; background: #fff8e1; border-radius: 6px; font-size: 11px; }
  .footer { text-align: center; color: #aaa; font-size: 10px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 16px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button type="button" onclick="window.print()" style="padding:8px 24px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Cetak / Simpan PDF</button>
  </div>
  <div class="header">
    <div>
      <div class="title">${doc.documentNumber}</div>
      <div class="subtitle">${DOCUMENT_LABELS[doc.documentType] ?? doc.documentType}</div>
      <div style="margin-top:4px;"><span class="status">${STATUS_LABELS[doc.status] ?? doc.status}</span></div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px;font-weight:600;">Ledjer</div>
      <div style="font-size:11px;color:#888;">Pencatatan Keuangan Bisnis</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item">
      <label>${doc.documentType === "purchase_order" ? "Pemasok" : "Kepada"}</label>
      <span>${party?.name ?? doc.partyId ?? "-"}</span>
      ${party?.email ? `<div style="font-size:11px;color:#888;">${party.email}</div>` : ""}
      ${party?.phone ? `<div style="font-size:11px;color:#888;">${party.phone}</div>` : ""}
    </div>
    <div>
      <div class="meta-item"><label>Tanggal</label><span>${doc.documentDate}</span></div>
      ${doc.deliveryDate ? `<div class="meta-item" style="margin-top:8px;"><label>Tanggal Kirim</label><span>${doc.deliveryDate}</span></div>` : ""}
      ${doc.paymentMethod ? `<div class="meta-item" style="margin-top:8px;"><label>Metode Bayar</label><span>${doc.paymentMethod}</span></div>` : ""}
    </div>
  </div>

  ${doc.referenceDocumentId ? `<div class="ref">Referensi: ${doc.referenceDocumentType} — ${doc.referenceDocumentId}</div>` : ""}

  <table>
    <thead>
      <tr><th style="width:50px;">#</th><th>Deskripsi</th><th class="text-right">Qty</th><th class="text-right">Harga</th><th class="text-right">Jumlah</th></tr>
    </thead>
    <tbody>
      ${doc.lines.map((l, i) => `
      <tr>
        <td style="color:#888;">${i + 1}</td>
        <td>${l.description}</td>
        <td class="text-right">${(l.quantityMilli / 1000).toFixed(2)}</td>
        <td class="text-right">${formatRupiah(l.unitPriceMinor)}</td>
        <td class="text-right">${formatRupiah(l.amountMinor)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${formatRupiah(doc.subtotalMinor)}</span></div>
    ${doc.discountMinor > 0 ? `<div class="totals-row" style="color:#d32f2f;"><span>Diskon</span><span>-${formatRupiah(doc.discountMinor)}</span></div>` : ""}
    ${doc.taxMinor > 0 ? `<div class="totals-row"><span>Pajak</span><span>${formatRupiah(doc.taxMinor)}</span></div>` : ""}
    <div class="totals-row totals-total"><span>Total</span><span>${formatRupiah(doc.totalMinor)}</span></div>
  </div>

  ${doc.notes ? `<div class="notes"><strong style="display:block;font-size:11px;color:#888;margin-bottom:4px;">Catatan</strong>${doc.notes}</div>` : ""}

  <div class="footer">Dokumen ini dibuat secara otomatis oleh Ledjer</div>
</body>
</html>`;

  return c.html(html);
});

export default app;
