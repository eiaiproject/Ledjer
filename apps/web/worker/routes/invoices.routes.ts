import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  updateInvoiceStatus,
} from "../services/invoices.service";

const app = new Hono<AppContext>();

// POST /api/invoices
app.post("/", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{
    invoiceDate: string; dueDate: string; partyId: string;
    lines: { productId?: string; description: string; quantityMilli?: number; unitPriceMinor: number; amountMinor: number }[];
    discountMinor?: number; taxMinor?: number; notes?: string; terms?: string;
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
  });
  return c.json(result, 201);
});

// GET /api/invoices
app.get("/", requireAuth, loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const result = await listInvoices(c.env.DB, organization.id, limit, offset);
  return c.json(result);
});

// GET /api/invoices/:id
app.get("/:id", requireAuth, loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const invoice = await getInvoice(c.env.DB, organization.id, c.req.param("id"));
  if (!invoice) return c.json({ error: { code: "not_found", message: "Faktur tidak ditemukan" } }, 404);
  return c.json(invoice);
});

// PATCH /api/invoices/:id/status
app.patch("/:id/status", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{ status: string; reason?: string }>();
  if (!body.status) throw badRequest("invalid_input", "status diperlukan");
  const result = await updateInvoiceStatus(c.env.DB, organization.id, user.id, c.req.param("id"), body.status, body.reason);
  return c.json(result);
});

export default app;
