import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { getDashboardAlerts, getDashboardSummary } from "../services/dashboard.service";

export const dashboardRoutes = new Hono<AppContext>();

dashboardRoutes.use("*", requireAuth());

dashboardRoutes.get("/summary", async (c) => {
  const summary = await getDashboardSummary(c.env.DB, c.get("user").id);
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ summary });
});

dashboardRoutes.get("/alerts", async (c) => {
  const result = await getDashboardAlerts(c.env.DB, c.get("user").id);
  c.res.headers.set("Cache-Control", "private, max-age=15");
  return c.json(result);
});
