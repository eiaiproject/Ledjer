import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest, tooManyRequests } from "../http/errors";
import { checkRateLimit } from "../services/rate-limit.service";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  updateInvoiceStatus,
  createCreditNote,
  getCreditNotesForInvoice,
} from "../services/invoices.service";
import { sendEmail } from "../services/email.service";

const app = new Hono<AppContext>();

// POST /api/invoices
app.post("/", requireAuth(), loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  if (await checkRateLimit(c.env.DB, "invoices_create", user.id, { max: 20, windowMs: 60000 })) {
    throw tooManyRequests("Too many requests");
  }
  const body = await c.req.json<{
    invoiceDate: string; dueDate: string; partyId: string;
    lines: { productId?: string; description: string; quantityMilli?: number; unitPriceMinor: number; amountMinor: number }[];
    discountMinor?: number; taxMinor?: number; notes?: string; terms?: string;
    idempotencyKey?: string;
  }>();

  if (!body.invoiceDate || !body.dueDate || !body.partyId || !body.lines?.length) {
    throw badRequest("invalid_input", "invoiceDate, dueDate, partyId, dan lines diperlukan");
  }

  const lines = body.lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantityMilli: l.quantityMilli ?? 1000,
    unitPriceMinor: l.unitPriceMinor,
    amountMinor: l.amountMinor,
  }));

  const result = await createInvoice(c.env.DB, organization.id, user.id, {
    invoiceDate: body.invoiceDate, dueDate: body.dueDate,
    partyId: body.partyId, lines,
    discountMinor: body.discountMinor, taxMinor: body.taxMinor,
    notes: body.notes, terms: body.terms,
    idempotencyKey: body.idempotencyKey,
  });
  return c.json(result, 201);
});

// GET /api/invoices
app.get("/", requireAuth(), loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") || "50", 10), 1), 100);
  const offset = Math.max(Number.parseInt(c.req.query("offset") || "0", 10), 0);
  const result = await listInvoices(c.env.DB, organization.id, limit, offset);
  return c.json(result);
});

// GET /api/invoices/:id
app.get("/:id", requireAuth(), loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const invoice = await getInvoice(c.env.DB, organization.id, c.req.param("id"));
  if (!invoice) return c.json({ error: { code: "not_found", message: "Faktur tidak ditemukan" } }, 404);
  return c.json(invoice);
});

// PATCH /api/invoices/:id/status
app.patch("/:id/status", requireAuth(), loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{ status: string; reason?: string }>();
  if (!body.status) throw badRequest("invalid_input", "status diperlukan");
  const result = await updateInvoiceStatus(c.env.DB, organization.id, user.id, c.req.param("id"), body.status, body.reason);
  return c.json(result);
});

// POST /api/invoices/:id/credit-note
app.post("/:id/credit-note", requireAuth(), loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{
    lines: { description: string; quantityMilli?: number; unitPriceMinor: number; amountMinor: number }[];
    discountMinor?: number; taxMinor?: number; notes?: string; reason?: string;
  }>();
  if (!body.lines?.length) throw badRequest("invalid_input", "Setidaknya satu item diperlukan");

  const lines = body.lines.map((l) => ({
    description: l.description,
    quantityMilli: l.quantityMilli ?? 1000,
    unitPriceMinor: l.unitPriceMinor,
    amountMinor: l.amountMinor,
  }));

  const result = await createCreditNote(
    c.env.DB, organization.id, user.id, c.req.param("id"),
    { lines, discountMinor: body.discountMinor, taxMinor: body.taxMinor, notes: body.notes, reason: body.reason },
  );
  return c.json(result, 201);
});

// GET /api/invoices/:id/credit-notes — list credit notes referencing this invoice
app.get("/:id/credit-notes", requireAuth(), loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const creditNotes = await getCreditNotesForInvoice(c.env.DB, organization.id, c.req.param("id"));
  return c.json(creditNotes);
});

// GET /api/invoices/:id/print — printable HTML view (for PDF print)
app.get("/:id/print", requireAuth(), loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const invoice = await getInvoice(c.env.DB, organization.id, c.req.param("id"));
  if (!invoice) return c.json({ error: { code: "not_found", message: "Faktur tidak ditemukan" } }, 404);

  // Fetch party info
  const party = await c.env.DB.prepare(
    `SELECT name, email, phone FROM parties WHERE id = ?`,
  ).bind(invoice.partyId).first<{ name: string; email: string | null; phone: string | null }>();

  const STATUS_LABELS: Record<string, string> = {
    draft: "Draft", issued: "Diterbitkan", sent: "Terkirim",
    partially_paid: "Dibayar Sebagian", paid: "Lunas",
    overdue: "Jatuh Tempo", voided: "Batal", credited: "Dikreditkan",
  };

  const formatRupiah = (n: number) => `Rp ${(n / 100).toLocaleString("id-ID")}`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${invoice.invoiceNumber}</title>
<style>
  @page { margin: 20mm; }
  body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a2e; font-size: 12px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 32px; }
  .title { font-size: 24px; font-weight: 700; color: #1a1a2e; }
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
      <div class="title">${invoice.invoiceNumber}</div>
      <div style="margin-top:4px;"><span class="status">${STATUS_LABELS[invoice.status] ?? invoice.status}</span></div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px;font-weight:600;">Ledjer</div>
      <div style="font-size:11px;color:#888;">Pencatatan Keuangan Bisnis</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item">
      <label>Kepada</label>
      <span>${party?.name ?? invoice.partyId}</span>
      ${party?.email ? `<div style="font-size:11px;color:#888;">${party.email}</div>` : ""}
      ${party?.phone ? `<div style="font-size:11px;color:#888;">${party.phone}</div>` : ""}
    </div>
    <div>
      <div class="meta-item"><label>Tanggal Faktur</label><span>${invoice.invoiceDate}</span></div>
      <div class="meta-item" style="margin-top:8px;"><label>Jatuh Tempo</label><span>${invoice.dueDate}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th style="width:50px;">#</th><th>Deskripsi</th><th class="text-right">Qty</th><th class="text-right">Harga</th><th class="text-right">Jumlah</th></tr>
    </thead>
    <tbody>
      ${invoice.lines.map((l, i) => `
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
    <div class="totals-row"><span>Subtotal</span><span>${formatRupiah(invoice.subtotalMinor)}</span></div>
    ${invoice.discountMinor > 0 ? `<div class="totals-row" style="color:#d32f2f;"><span>Diskon</span><span>-${formatRupiah(invoice.discountMinor)}</span></div>` : ""}
    ${invoice.taxMinor > 0 ? `<div class="totals-row"><span>Pajak</span><span>${formatRupiah(invoice.taxMinor)}</span></div>` : ""}
    <div class="totals-row totals-total"><span>Total</span><span>${formatRupiah(invoice.totalMinor)}</span></div>
    ${invoice.paidMinor > 0 ? `<div class="totals-row" style="color:#2e7d32;"><span>Dibayar</span><span>${formatRupiah(invoice.paidMinor)}</span></div>` : ""}
  </div>

  ${invoice.notes ? `<div class="notes"><strong style="display:block;font-size:11px;color:#888;margin-bottom:4px;">Catatan</strong>${invoice.notes}</div>` : ""}

  <div class="footer">Dokumen ini dibuat secara otomatis oleh Ledjer</div>
</body>
</html>`;

  return c.html(html);
});

// POST /api/invoices/:id/send-email
app.post("/:id/send-email", requireAuth(), loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const invoice = await getInvoice(c.env.DB, organization.id, c.req.param("id"));
  if (!invoice) return c.json({ error: { code: "not_found", message: "Faktur tidak ditemukan" } }, 404);

  const { to } = await c.req.json<{ to: string }>();
  if (!to) throw badRequest("invalid_input", "Alamat email tujuan diperlukan");

  // Fetch party info for name
  const party = await c.env.DB.prepare(
    `SELECT name FROM parties WHERE id = ?`,
  ).bind(invoice.partyId).first<{ name: string }>();

  const STATUS_LABELS: Record<string, string> = {
    draft: "Draft", issued: "Diterbitkan", sent: "Terkirim",
    partially_paid: "Dibayar Sebagian", paid: "Lunas",
    overdue: "Jatuh Tempo", voided: "Batal", credited: "Dikreditkan",
  };

  const formatRupiah = (n: number) => `Rp ${(n / 100).toLocaleString("id-ID")}`;

  const linesHtml = invoice.lines.map((l, i) =>
    `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${i + 1}</td><td style="padding:8px;border-bottom:1px solid #eee;">${l.description}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${(l.quantityMilli / 1000).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatRupiah(l.unitPriceMinor)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatRupiah(l.amountMinor)}</td></tr>`
  ).join("");

  const emailHtml = `
<div style="font-family:'Inter',-apple-system,sans-serif;max-width:600px;margin:0 auto;">
  <div style="border-bottom:2px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px;">
    <h1 style="font-size:20px;font-weight:700;margin:0;">${invoice.invoiceNumber}</h1>
    <p style="color:#888;margin:4px 0 0 0;">${STATUS_LABELS[invoice.status] ?? invoice.status}</p>
  </div>
  ${party ? `<p style="font-size:14px;margin-bottom:20px;">Kepada Yth. ${party.name},</p>` : ""}
  <p style="font-size:13px;color:#555;margin-bottom:20px;">Berikut adalah faktur untuk tagihan Anda.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <thead><tr style="background:#f5f5f5;">
      <th style="padding:8px;text-align:left;font-size:11px;color:#888;">#</th>
      <th style="padding:8px;text-align:left;font-size:11px;color:#888;">Deskripsi</th>
      <th style="padding:8px;text-align:right;font-size:11px;color:#888;">Qty</th>
      <th style="padding:8px;text-align:right;font-size:11px;color:#888;">Harga</th>
      <th style="padding:8px;text-align:right;font-size:11px;color:#888;">Jumlah</th>
    </tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>
  <div style="border-top:2px solid #1a1a2e;padding-top:12px;text-align:right;font-size:16px;font-weight:700;">
    Total: ${formatRupiah(invoice.totalMinor)}
  </div>
  ${invoice.notes ? `<div style="margin-top:20px;padding:12px;background:#f9f9f9;border-radius:6px;font-size:13px;"><strong style="display:block;margin-bottom:4px;color:#888;">Catatan</strong>${invoice.notes}</div>` : ""}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;">
    Dikirim oleh Ledjer — Pencatatan Keuangan Bisnis
  </div>
</div>`;

  const apiKey = c.env.EMAIL_API_KEY ?? "";

  await sendEmail(apiKey, {
    to,
    subject: `Faktur ${invoice.invoiceNumber} dari Ledjer`,
    html: emailHtml,
  });

  // Auto-update status to 'sent' if currently 'issued'
  if (invoice.status === "issued") {
    await updateInvoiceStatus(c.env.DB, organization.id, user.id, invoice.id, "sent");
  }

  return c.json({ success: true, message: `Email terkirim ke ${to}` });
});

export default app;
