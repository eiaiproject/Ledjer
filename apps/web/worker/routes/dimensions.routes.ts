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
  listDimensions,
  getDimension,
  createDimension,
  updateDimension,
  deleteDimension,
  getTransactionTags,
  setTransactionTags,
  getDimensionReport,
  getDimensionSummary,
  type DimensionType,
} from "../services/dimensions.service";

const dimensionTypeSchema = z.enum([
  "branch", "department", "project", "cost_center", "profit_center",
]);

const createDimensionSchema = z.object({
  dimensionType: dimensionTypeSchema,
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  parentId: z.string().nullable().optional(),
});

const updateDimensionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const setTagsSchema = z.object({
  dimensionIds: z.array(z.string().min(1)),
});

export const dimensionsRoutes = new Hono<AppContext>();

dimensionsRoutes.use("*", requireAuth());
dimensionsRoutes.use("*", loadCurrentOrganization());

// ── Dimension CRUD ─────────────────────────────────────────────

dimensionsRoutes.get("/", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);

  const dimensions = await listDimensions(c.env.DB, context.organization.id, {
    dimensionType: url.searchParams.get("dimensionType") as DimensionType | undefined,
    isActive: url.searchParams.get("isActive") !== "false",
    limit: Number.parseInt(url.searchParams.get("limit") ?? "100", 10),
    offset: Number.parseInt(url.searchParams.get("offset") ?? "0", 10),
  });

  return c.json({ dimensions });
});

dimensionsRoutes.get("/summary", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const summary = await getDimensionSummary(c.env.DB, context.organization.id);
  return c.json({ summary });
});

dimensionsRoutes.get("/report", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const dimensionType = url.searchParams.get("dimensionType") as DimensionType | null;
  const periodFrom = url.searchParams.get("periodFrom");
  const periodTo = url.searchParams.get("periodTo");

  if (!dimensionType || !periodFrom || !periodTo) {
    return c.json({ error: "dimensionType, periodFrom, and periodTo are required" }, 400);
  }

  const report = await getDimensionReport(c.env.DB, context.organization.id, dimensionType, periodFrom, periodTo);
  return c.json(report);
});

dimensionsRoutes.get("/:id", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const dimension = await getDimension(c.env.DB, context.organization.id, c.req.param("id"));
  if (!dimension) return c.json({ error: "Dimension not found" }, 404);
  return c.json({ dimension });
});

dimensionsRoutes.post("/", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, createDimensionSchema);

  const dimension = await createDimension(c.env.DB, context.organization.id, context.member.user_id, {
    dimensionType: body.dimensionType,
    code: body.code,
    name: body.name,
    description: body.description,
    parentId: body.parentId ?? null,
  });

  return c.json({ dimension });
});

dimensionsRoutes.put("/:id", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, updateDimensionSchema);

  const dimension = await updateDimension(c.env.DB, context.organization.id, context.member.user_id, c.req.param("id"), body);
  return c.json({ dimension });
});

dimensionsRoutes.delete("/:id", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  await deleteDimension(c.env.DB, context.organization.id, context.member.user_id, c.req.param("id"));
  return c.json({ success: true });
});

// ── Transaction Tags ───────────────────────────────────────────

dimensionsRoutes.get("/tags/:transactionId", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const tags = await getTransactionTags(c.env.DB, context.organization.id, c.req.param("transactionId"));
  return c.json({ tags });
});

dimensionsRoutes.put("/tags/:transactionId", requirePermission("transactions:create"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, setTagsSchema);

  const tags = await setTransactionTags(
    c.env.DB, context.organization.id, context.member.user_id,
    c.req.param("transactionId"), body.dimensionIds,
  );
  return c.json({ tags });
});
