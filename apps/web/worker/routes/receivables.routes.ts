import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import {
  recordPayment,
  getAgingReport,
  getPartyStatement,
} from "../services/receivables.service";

const app = new Hono<AppContext>();

// POST /api/receivables/pay - record payment against invoice
app.post("/pay", requireAuth(), loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{
    invoiceId: string; amountMinor: number; allocationDate: string;
    transactionId?: string; notes?: string;
  }>();

  if (!body.invoiceId || !body.amountMinor || !body.allocationDate) {
    throw badRequest("invalid_input", "invoiceId, amountMinor, allocationDate diperlukan");
  }

  await recordPayment(c.env.DB, organization.id, user.id, body.invoiceId, body.amountMinor, body.allocationDate, body.transactionId, body.notes);
  return c.json({ success: true });
});

// GET /api/receivables/aging?partyType=customer
app.get("/aging", requireAuth(), loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const partyType = c.req.query("partyType") || undefined;
  const result = await getAgingReport(c.env.DB, organization.id, partyType);
  return c.json({ aging: result });
});

// GET /api/receivables/statement/:partyId
app.get("/statement/:partyId", requireAuth(), loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const result = await getPartyStatement(c.env.DB, organization.id, c.req.param("partyId"));
  return c.json(result);
});

export default app;
