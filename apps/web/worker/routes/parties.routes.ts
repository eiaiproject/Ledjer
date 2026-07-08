import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { listParties } from "../services/parties.service";

export const partiesRoutes = new Hono<AppContext>();

partiesRoutes.use("*", requireAuth());
partiesRoutes.use("*", loadCurrentOrganization());

partiesRoutes.get("/", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const parties = await listParties(c.env.DB, context.organization.id);
  return c.json({ parties });
});
