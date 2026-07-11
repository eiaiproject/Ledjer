import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
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

// ponytail: frontend sends { accountCode, openingBalance, description } —
// accept both old and new formats until frontend is migrated.
const extraOpeningBalanceSchema = z.object({
  accountCode: z.string().min(1).optional(),
  openingBalance: z.number().min(0).optional(),
  accountId: z.string().min(1).optional(),
  amount: z.number().min(1).optional(),
  description: z.string().optional(),
});

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
  const session = c.get("session");
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
  const state = await createOrganization(c.env.DB, c.get("session"), body);
  return c.json(state);
});

organizationRoutes.get("/current", async (c) => {
  const state = await getCurrentOrganization(c.env.DB, c.get("session"));
  return c.json(state);
});

organizationRoutes.post("/current", async (c) => {
  const body = await readJson(c, selectCurrentOrganizationSchema);
  const state = await setCurrentOrganization(
    c.env.DB,
    c.get("session"),
    body.organizationId,
  );
  return c.json(state);
});

organizationRoutes.get("/:organizationId", async (c) => {
  const session = c.get("session");
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
