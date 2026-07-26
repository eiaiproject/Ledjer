import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { getDashboardSummary, getDashboardAlerts } from "../services/dashboard.service";

export const dashboardRoutes = new Hono<AppContext>();

dashboardRoutes.use("*", requireAuth());
dashboardRoutes.use("*", loadCurrentOrganization());
dashboardRoutes.use("*", requirePermission("reports:read"));

dashboardRoutes.get("/summary", async (c) => {
  const context = c.get("organizationContext");
  const summary = await getDashboardSummary(c.env.DB, context.organization.id);
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ summary });
});

dashboardRoutes.get("/alerts", async (c) => {
  const context = c.get("organizationContext");
  const result = await getDashboardAlerts(c.env.DB, context.organization.id);
  c.res.headers.set("Cache-Control", "private, max-age=15");
  return c.json(result);
});
