import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { currentSession, requireAuth } from "../middleware/auth.middleware";
import { forbidden } from "../http/errors";
import { readJson } from "../http/json";
import {
  createOrganization,
  getCurrentOrganization,
  getOrganizationContextForUser,
  listOrganizationsForUser,
  setCurrentOrganization,
} from "../services/organization.service";

const businessTypeSchema = z.enum(["service", "simple_trading"]);

const extraOpeningBalanceSchema = z.object({
  openingBalance: z.number().min(0).optional(),
}).passthrough();

const createOrganizationSchema = z.object({
  organizationName: z.string().min(2).max(160),
  businessType: businessTypeSchema,
  booksStartDate: z.string().min(1).max(10),
  baseCurrency: z.string().min(3).max(3).default("IDR"),
  openingCashBalance: z.number().min(0).default(0),
  extraOpeningBalances: z.array(extraOpeningBalanceSchema).default([]),
});

const selectCurrentOrganizationSchema = z.object({
  organizationId: z.string().min(1),
});

export const organizationRoutes = new Hono<AppContext>();

organizationRoutes.use("*", requireAuth());

organizationRoutes.get("/", async (c) => {
  const session = currentSession(c);
  const organizations = await listOrganizationsForUser(c.env.DB, session.user_id);

  return c.json({
    organizations: organizations.map((context) => ({
      ...context,
      needsOnboarding: context.organization.onboarding_status !== "completed",
      error: null,
    })),
  });
});

organizationRoutes.post("/", async (c) => {
  const body = await readJson(c, createOrganizationSchema);
  const state = await createOrganization(c.env.DB, currentSession(c), body);
  return c.json(state);
});

organizationRoutes.get("/current", async (c) => {
  const state = await getCurrentOrganization(c.env.DB, currentSession(c));
  return c.json(state);
});

organizationRoutes.post("/current", async (c) => {
  const body = await readJson(c, selectCurrentOrganizationSchema);
  const state = await setCurrentOrganization(
    c.env.DB,
    currentSession(c),
    body.organizationId,
  );
  return c.json(state);
});

organizationRoutes.get("/:organizationId", async (c) => {
  const session = currentSession(c);
  const context = await getOrganizationContextForUser(
    c.env.DB,
    session.user_id,
    c.req.param("organizationId"),
  );

  if (!context) {
    throw forbidden("organization_forbidden", "Organization access denied");
  }

  return c.json({
    ...context,
    needsOnboarding: context.organization.onboarding_status !== "completed",
    error: null,
  });
});
