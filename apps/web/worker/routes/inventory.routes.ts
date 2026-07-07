import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { listStockMovements } from "../services/products.service";

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
