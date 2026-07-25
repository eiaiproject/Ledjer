import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { getOnboardingStatus } from "../services/onboarding.service";

export const onboardingRoutes = new Hono<AppContext>();

onboardingRoutes.use("*", requireAuth());
onboardingRoutes.use("*", loadCurrentOrganization());

onboardingRoutes.get("/status", requirePermission("organization:read"), async (c) => {
  const context = c.get("organizationContext");
  const status = await getOnboardingStatus(c.env.DB, context.organization.id);
  return c.json(status);
});
