import { z } from "zod";
import { Hono } from "hono";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  listStockMovements,
  recordStockAdjustment,
  recordStockCount,
} from "../services/products.service";

const adjustStockSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number(),
  reason: z.string().min(1).max(500),
  movementDate: z.string().optional(),
});

const stockCountSchema = z.object({
  productId: z.string().min(1),
  physicalStock: z.number().min(0),
  notes: z.string().max(500).optional(),
});

export const inventoryRoutes = new Hono<AppContext>();

inventoryRoutes.use("*", requireAuth());
inventoryRoutes.use("*", loadCurrentOrganization());

inventoryRoutes.get("/movements", requirePermission("products:read"), async (c) => {
  const context = c.get("organizationContext");
  const productId = new URL(c.req.url).searchParams.get("productId") ?? undefined;
  const movements = await listStockMovements(
    c.env.DB,
    context.organization.id,
    productId,
  );
  return c.json({ movements });
});

/**
 * POST /api/inventory/adjust
 * Record a manual stock adjustment with a required reason.
 */
inventoryRoutes.post("/adjust", requirePermission("products:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, adjustStockSchema);
  const movement = await recordStockAdjustment(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
  );
  return c.json({ movement });
});

/**
 * POST /api/inventory/stock-count
 * Record a physical stock count and get the difference vs system stock.
 */
inventoryRoutes.post("/stock-count", requirePermission("products:read"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, stockCountSchema);
  const result = await recordStockCount(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
  );
  return c.json(result);
});
