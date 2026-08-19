import { Hono } from "hono";
import type { AppContext } from "../env";
import { getPlatformSummary } from "../services/admin-monitoring.service";

export const monitoringRoutes = new Hono<AppContext>();

monitoringRoutes.get("/summary", async (c) => {
  const summary = await getPlatformSummary(c.env.DB, c.env.USER_APP_ORIGIN, c.env.MAIN_APP);
  return c.json(summary);
});
