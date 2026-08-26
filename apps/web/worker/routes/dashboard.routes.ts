import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { getDashboardSummary, getDashboardAlerts, computeInventoryMismatch } from "../services/dashboard.service";

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

// On-demand inventory reconciliation. Recomputes the Persediaan control-account
// balance vs the stock subledger value (no cache) so the mismatch alert can be
// checked/refreshed immediately after a correction without waiting for the
// dashboard's short-cache (max-age=15) to expire.
dashboardRoutes.get("/inventory-reconciliation", async (c) => {
  const context = c.get("organizationContext");
  const recon = await computeInventoryMismatch(c.env.DB, context.organization.id);
  c.res.headers.set("Cache-Control", "no-store");
  return c.json({
    organization_id: context.organization.id,
    account_balance: recon.accountBalance,
    stock_value: recon.stockValue,
    diff: recon.diff,
    matched: recon.matched,
  });
});
