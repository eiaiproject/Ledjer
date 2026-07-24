import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import { queryFirst } from "../db/client";
import { previewOpeningBalance, postOpeningBalance } from "../services/opening-balance.service";

const app = new Hono<AppContext>();

// GET /api/opening-balance/status
app.get("/status", requireAuth, loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const needsOnboarding = organization.onboarding_status !== "completed";

  const existing = await queryFirst<{ cnt: number }>(
    c.env.DB,
    `SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = ? AND entry_type = 'opening_balance'`,
    [organization.id],
  );

  return c.json({
    needsOnboarding,
    hasOpeningBalance: (existing?.cnt ?? 0) > 0,
    booksStartDate: organization.books_start_date,
  });
});

// POST /api/opening-balance/preview
app.post("/preview", requireAuth, loadCurrentOrganization(), requirePermission("organization:update"), async (c) => {
  const input = await c.req.json<{ lines: { accountId: string; amount: number }[] }>();
  if (!input.lines || !Array.isArray(input.lines)) {
    throw badRequest("invalid_input", "Lines required");
  }
  const { organization } = c.get("organizationContext");
  const result = await previewOpeningBalance(c.env.DB, organization.id, { date: organization.books_start_date, lines: input.lines });
  return c.json(result);
});

// POST /api/opening-balance/post
app.post("/post", requireAuth, loadCurrentOrganization(), requirePermission("organization:update"), async (c) => {
  const input = await c.req.json<{ date?: string; lines: { accountId: string; amount: number }[] }>();
  if (!input.lines || !Array.isArray(input.lines)) {
    throw badRequest("invalid_input", "Lines required");
  }
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const result = await postOpeningBalance(
    c.env.DB, organization.id, user.id,
    { date: input.date ?? organization.books_start_date, lines: input.lines },
  );
  return c.json(result);
});

export default app;
