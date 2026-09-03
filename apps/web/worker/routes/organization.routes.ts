import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { readJson } from "../http/json";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { getCurrentOrganization, updateOrganization } from "../services/organization.service";

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(120),
});

export const organizationRoutes = new Hono<AppContext>();

organizationRoutes.use("*", requireAuth());

organizationRoutes.get("/current", async (c) => {
  const session = c.get("session");
  const context = await getCurrentOrganization(c.env.DB, session);
  if (!context) {
    return c.json({ organization: null, member: null, needsOnboarding: false, error: null });
  }
  return c.json({ ...context, needsOnboarding: false, error: null });
});

organizationRoutes.patch("/current", loadCurrentOrganization(), requirePermission("organization:update"), async (c) => {
  const session = c.get("session");
  const context = c.get("organizationContext");
  const body = await readJson(c, updateOrganizationSchema);
  await updateOrganization(c.env.DB, context.organization.id, session.user_id, body.name);
  const updated = await getCurrentOrganization(c.env.DB, session);
  return c.json(updated);
});