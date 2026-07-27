import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  listBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getActualVsBudget,
  checkBudgetVariance,
  generateForecast,
} from "../services/budgets.service";

const createBudgetSchema = z.object({
  accountId: z.string().min(1),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountMinor: z.number().int().min(0),
  dimensionType: z.enum(["branch", "project", "cost_center"]).nullable().optional(),
  dimensionValue: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    amountMinor: z.number().int().min(0),
  })).optional(),
});

const updateBudgetSchema = z.object({
  amountMinor: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  dimensionType: z.enum(["branch", "project", "cost_center"]).nullable().optional(),
  dimensionValue: z.string().max(200).nullable().optional(),
  lines: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    amountMinor: z.number().int().min(0),
  })).optional(),
});

const forecastSchema = z.object({
  accountId: z.string().min(1),
  monthsAhead: z.number().int().min(1).max(12).default(3),
});

export const budgetsRoutes = new Hono<AppContext>();

budgetsRoutes.use("*", requireAuth());
budgetsRoutes.use("*", loadCurrentOrganization());

// ── Static routes first (before /:id to avoid param capture) ──

budgetsRoutes.get("/report/actual-vs-budget", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const periodFrom = url.searchParams.get("periodFrom");
  const periodTo = url.searchParams.get("periodTo");

  if (!periodFrom || !periodTo) {
    return c.json({ error: "periodFrom and periodTo are required" }, 400);
  }

  const report = await getActualVsBudget(c.env.DB, context.organization.id, periodFrom, periodTo);
  return c.json(report);
});

budgetsRoutes.get("/variance-alerts", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const threshold = Number.parseInt(url.searchParams.get("threshold") ?? "20", 10);

  const alerts = await checkBudgetVariance(c.env.DB, context.organization.id, threshold);
  return c.json({ alerts });
});

budgetsRoutes.post("/forecast", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, forecastSchema);

  const forecast = await generateForecast(
    c.env.DB,
    context.organization.id,
    body.accountId,
    body.monthsAhead,
  );

  return c.json({ forecast });
});

// ── Budget CRUD (parametric :id routes) ──────────────────────────

budgetsRoutes.get("/", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);

  const budgets = await listBudgets(c.env.DB, context.organization.id, {
    accountId: url.searchParams.get("accountId") ?? undefined,
    isActive: url.searchParams.get("isActive") !== "false",
    periodFrom: url.searchParams.get("periodFrom") ?? undefined,
    periodTo: url.searchParams.get("periodTo") ?? undefined,
    limit: Number.parseInt(url.searchParams.get("limit") ?? "50", 10),
    offset: Number.parseInt(url.searchParams.get("offset") ?? "0", 10),
  });

  return c.json({ budgets });
});

budgetsRoutes.get("/:id", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const budget = await getBudget(c.env.DB, context.organization.id, c.req.param("id"));
  if (!budget) return c.json({ error: "Budget not found" }, 404);
  return c.json({ budget });
});

budgetsRoutes.post("/", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, createBudgetSchema);

  const budget = await createBudget(c.env.DB, context.organization.id, context.member.user_id, {
    accountId: body.accountId,
    periodFrom: body.periodFrom,
    periodTo: body.periodTo,
    amountMinor: body.amountMinor,
    dimensionType: body.dimensionType ?? null,
    dimensionValue: body.dimensionValue ?? null,
    notes: body.notes,
    lines: body.lines,
  });

  return c.json({ budget });
});

budgetsRoutes.put("/:id", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, updateBudgetSchema);

  const budget = await updateBudget(c.env.DB, context.organization.id, context.member.user_id, c.req.param("id"), body);
  return c.json({ budget });
});

budgetsRoutes.delete("/:id", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  await deleteBudget(c.env.DB, context.organization.id, context.member.user_id, c.req.param("id"));
  return c.json({ success: true });
});
