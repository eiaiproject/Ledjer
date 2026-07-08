import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { getDashboardSummary } from "../services/dashboard.service";

export const dashboardRoutes = new Hono<AppContext>();

dashboardRoutes.use("*", requireAuth());
dashboardRoutes.use("*", loadCurrentOrganization());
dashboardRoutes.use("*", requirePermission("reports:read"));

dashboardRoutes.get("/summary", async (c) => {
  const context = c.get("organizationContext");
  const summary = await getDashboardSummary(c.env.DB, context.organization.id);
  return c.json({ summary });
});
