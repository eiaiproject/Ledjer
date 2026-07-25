import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  runCloseChecklist,
  closePeriod,
} from "../services/period-close.service";

const closePeriodSchema = z.object({
  periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
});

export const periodCloseRoutes = new Hono<AppContext>();

periodCloseRoutes.use("*", requireAuth());
periodCloseRoutes.use("*", loadCurrentOrganization());

// ── Checklist endpoint ───────────────────────────────────────────

periodCloseRoutes.get("/checklist", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const periodEndDate = url.searchParams.get("periodEndDate");
  if (!periodEndDate) return c.json({ error: "periodEndDate is required" }, 400);

  const result = await runCloseChecklist(
    c.env.DB,
    context.organization.id,
    periodEndDate,
  );
  return c.json(result);
});

// ── Close period endpoint ────────────────────────────────────────

periodCloseRoutes.post("/close", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, closePeriodSchema);

  const result = await closePeriod(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body.periodEndDate,
    body.reason,
  );
  return c.json(result);
});
