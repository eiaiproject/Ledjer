import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import {
  importStatement,
  getSuggestions,
  confirmMatch,
  getReconciliationReport,
} from "../services/reconciliation.service";

const app = new Hono<AppContext>();

// POST /api/reconciliation/import-statement
app.post("/import-statement", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{
    accountId: string; statementDate: string; openingBalance: number;
    closingBalance: number; fileName?: string;
    lines: { date: string; description: string; amount: number; balance?: number; reference?: string }[];
  }>();

  if (!body.accountId || !body.statementDate || !body.lines?.length) {
    throw badRequest("invalid_input", "accountId, statementDate, dan lines diperlukan");
  }

  const result = await importStatement(c.env.DB, organization.id, user.id, {
    accountId: body.accountId,
    statementDate: body.statementDate,
    openingBalance: body.openingBalance,
    closingBalance: body.closingBalance,
    fileName: body.fileName ?? "",
    lines: body.lines,
  });
  return c.json(result, 201);
});

// GET /api/reconciliation/:statementId/suggestions
app.get("/:statementId/suggestions", requireAuth, loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const suggestions = await getSuggestions(c.env.DB, organization.id, c.req.param("statementId"));
  return c.json({ suggestions });
});

// POST /api/reconciliation/:statementId/confirm
app.post("/:statementId/confirm", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{ matches: { statementLineId: string; transactionId: string | null }[] }>();
  if (!body.matches?.length) throw badRequest("invalid_input", "matches diperlukan");
  const result = await confirmMatch(c.env.DB, organization.id, user.id, c.req.param("statementId"), body.matches);
  return c.json(result);
});

// GET /api/reconciliation/:statementId/report
app.get("/:statementId/report", requireAuth, loadCurrentOrganization(), requirePermission("reports:read"), async (c) => {
  const { organization } = c.get("organizationContext");
  const report = await getReconciliationReport(c.env.DB, organization.id, c.req.param("statementId"));
  return c.json(report);
});

export default app;
