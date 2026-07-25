import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { getOnboardingStatus, generateSampleData, removeSampleData } from "../services/onboarding.service";

export const onboardingRoutes = new Hono<AppContext>();

onboardingRoutes.use("*", requireAuth());
onboardingRoutes.use("*", loadCurrentOrganization());

onboardingRoutes.get("/status", requirePermission("organization:read"), async (c) => {
  const context = c.get("organizationContext");
  const status = await getOnboardingStatus(c.env.DB, context.organization.id);
  return c.json(status);
});

/**
 * POST /api/onboarding/sample-data
 * Generates sample products, parties, and a demo transaction so new users
 * can explore the app before entering real data.
 */
onboardingRoutes.post("/sample-data", requirePermission("products:write"), async (c) => {
  const context = c.get("organizationContext");
  const session = c.get("session");
  const result = await generateSampleData(c.env.DB, context.organization.id, session.user_id);
  return c.json(result);
});

/**
 * POST /api/onboarding/remove-sample-data
 * Removes all sample data that was generated during onboarding.
 * Only removes items tagged with the "sample-data" prefix in their description.
 */
onboardingRoutes.post("/remove-sample-data", requirePermission("products:write"), async (c) => {
  const context = c.get("organizationContext");
  const result = await removeSampleData(c.env.DB, context.organization.id);
  return c.json(result);
});
