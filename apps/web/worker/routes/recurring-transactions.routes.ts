import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import {
  createRecurringTransaction,
  getRecurringTransaction,
  listRecurringTransactions,
  updateRecurringTransaction,
  updateRecurringStatus,
  skipNextOccurrence,
  executeRecurringTransaction,
  getExecutionLog,
  type CreateRecurringInput,
  type Frequency,
  type RecurringStatus,
} from "../services/recurring-transactions.service";
import { postTransaction } from "../services/transactions.service";

const app = new Hono<AppContext>();

// POST /api/recurring-transactions — create a new recurring transaction
app.post("/", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<CreateRecurringInput>();

  if (!body.name || !body.transactionType || !body.frequency || !body.startDate || !body.amountMinor) {
    throw badRequest("invalid_input", "name, transactionType, frequency, startDate, dan amountMinor diperlukan");
  }

  const VALID_FREQ = ["daily", "weekly", "monthly", "yearly", "custom_days"];
  if (!VALID_FREQ.includes(body.frequency)) {
    throw badRequest("invalid_frequency", `Frekuensi tidak valid: ${body.frequency}`);
  }

  const result = await createRecurringTransaction(c.env.DB, organization.id, user.id, body);
  return c.json(result, 201);
});

// GET /api/recurring-transactions — list all recurring transactions
app.get("/", requireAuth, loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const status = c.req.query("status") as RecurringStatus | undefined;
  const result = await listRecurringTransactions(c.env.DB, organization.id, status);
  return c.json(result);
});

// GET /api/recurring-transactions/:id — get detail
app.get("/:id", requireAuth, loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const result = await getRecurringTransaction(c.env.DB, organization.id, c.req.param("id"));
  return c.json(result);
});

// PATCH /api/recurring-transactions/:id — update
app.patch("/:id", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{
    name?: string; amountMinor?: number; partyId?: string;
    cashAccountId?: string; debitAccountId?: string;
    description?: string; notes?: string; endDate?: string; postAsDraft?: boolean;
  }>();
  const result = await updateRecurringTransaction(c.env.DB, organization.id, user.id, c.req.param("id"), body);
  return c.json(result);
});

// PATCH /api/recurring-transactions/:id/status — change status
app.patch("/:id/status", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{ status: RecurringStatus }>();
  if (!body.status) throw badRequest("invalid_input", "status diperlukan");
  const result = await updateRecurringStatus(c.env.DB, organization.id, user.id, c.req.param("id"), body.status);
  return c.json(result);
});

// POST /api/recurring-transactions/:id/skip — skip next occurrence
app.post("/:id/skip", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { organization } = c.get("organizationContext");
  const result = await skipNextOccurrence(c.env.DB, organization.id, c.req.param("id"));
  return c.json(result);
});

// POST /api/recurring-transactions/:id/execute — manually trigger execution
app.post("/:id/execute", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const result = await executeRecurringTransaction(
    c.env.DB, organization.id, user.id, c.req.param("id"),
    postTransaction,
  );
  return c.json(result);
});

// GET /api/recurring-transactions/:id/logs — execution history
app.get("/:id/logs", requireAuth, loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const logs = await getExecutionLog(c.env.DB, organization.id, c.req.param("id"), limit);
  return c.json(logs);
});

export default app;
