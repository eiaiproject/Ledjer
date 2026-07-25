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
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  runDepreciation,
  getPendingDepreciation,
  postDepreciation,
  disposeAsset,
  getBookValueReport,
  type AssetCategory,
  type DepreciationMethod,
} from "../services/fixed-assets.service";

const assetCategorySchema = z.enum([
  "building", "machinery", "vehicle", "office_equipment",
  "computer", "furniture", "land", "other",
]);

const depreciationMethodSchema = z.enum([
  "straight_line", "declining_balance", "sum_of_years_digits",
]);

const createAssetSchema = z.object({
  assetCode: z.string().min(1).max(50),
  assetName: z.string().min(1).max(200),
  assetCategory: assetCategorySchema,
  description: z.string().max(2000).optional(),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acquisitionCostMinor: z.number().int().min(0),
  residualValueMinor: z.number().int().min(0).optional(),
  usefulLifeMonths: z.number().int().min(1).max(600),
  depreciationMethod: depreciationMethodSchema,
  decliningBalanceRate: z.number().min(0).max(1).nullable().optional(),
  accountAssetId: z.string().min(1),
  accountDepreciationId: z.string().min(1),
  accountExpenseId: z.string().min(1),
});

const updateAssetSchema = z.object({
  assetName: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  residualValueMinor: z.number().int().min(0).optional(),
  usefulLifeMonths: z.number().int().min(1).max(600).optional(),
  depreciationMethod: depreciationMethodSchema.optional(),
  decliningBalanceRate: z.number().min(0).max(1).nullable().optional(),
  accountAssetId: z.string().min(1).optional(),
  accountDepreciationId: z.string().min(1).optional(),
  accountExpenseId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const depreciationRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

const postDepreciationSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const disposeSchema = z.object({
  disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  disposalPriceMinor: z.number().int().min(0),
  disposalReason: z.string().min(1).max(500),
  disposalType: z.enum(["disposed", "sold"]),
});

export const fixedAssetsRoutes = new Hono<AppContext>();

fixedAssetsRoutes.use("*", requireAuth());
fixedAssetsRoutes.use("*", loadCurrentOrganization());

// ── Asset CRUD ─────────────────────────────────────────────────

fixedAssetsRoutes.get("/", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);

  const assets = await listAssets(c.env.DB, context.organization.id, {
    status: url.searchParams.get("status") as never ?? undefined,
    category: url.searchParams.get("category") as AssetCategory | undefined,
    isActive: url.searchParams.get("isActive") !== "false",
    limit: parseInt(url.searchParams.get("limit") ?? "50", 10),
    offset: parseInt(url.searchParams.get("offset") ?? "0", 10),
  });

  return c.json({ assets });
});

fixedAssetsRoutes.get("/report/book-value", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const asOfDate = url.searchParams.get("asOfDate") ?? undefined;

  const report = await getBookValueReport(c.env.DB, context.organization.id, asOfDate);
  return c.json({ report });
});

fixedAssetsRoutes.get("/:id", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const asset = await getAsset(c.env.DB, context.organization.id, c.req.param("id"));
  if (!asset) return c.json({ error: "Asset not found" }, 404);
  return c.json({ asset });
});

fixedAssetsRoutes.post("/", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, createAssetSchema);

  const asset = await createAsset(c.env.DB, context.organization.id, context.member.user_id, {
    assetCode: body.assetCode,
    assetName: body.assetName,
    assetCategory: body.assetCategory,
    description: body.description,
    acquisitionDate: body.acquisitionDate,
    acquisitionCostMinor: body.acquisitionCostMinor,
    residualValueMinor: body.residualValueMinor,
    usefulLifeMonths: body.usefulLifeMonths,
    depreciationMethod: body.depreciationMethod,
    decliningBalanceRate: body.decliningBalanceRate ?? null,
    accountAssetId: body.accountAssetId,
    accountDepreciationId: body.accountDepreciationId,
    accountExpenseId: body.accountExpenseId,
  });

  return c.json({ asset });
});

fixedAssetsRoutes.put("/:id", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, updateAssetSchema);

  const asset = await updateAsset(c.env.DB, context.organization.id, context.member.user_id, c.req.param("id"), body);
  return c.json({ asset });
});

// ── Depreciation ────────────────────────────────────────────────

fixedAssetsRoutes.post("/depreciation/run", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, depreciationRunSchema);

  const result = await runDepreciation(c.env.DB, context.organization.id, body.period);
  return c.json(result);
});

fixedAssetsRoutes.get("/depreciation/pending", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const period = url.searchParams.get("period");
  if (!period) return c.json({ error: "period is required" }, 400);

  const pending = await getPendingDepreciation(c.env.DB, context.organization.id, period);
  return c.json(pending);
});

fixedAssetsRoutes.post("/depreciation/post", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, postDepreciationSchema);

  const result = await postDepreciation(
    c.env.DB, context.organization.id, context.member.user_id,
    body.period, body.entryDate,
  );
  return c.json(result);
});

// ── Disposal ────────────────────────────────────────────────────

fixedAssetsRoutes.post("/:id/dispose", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, disposeSchema);

  const asset = await disposeAsset(
    c.env.DB, context.organization.id, context.member.user_id,
    c.req.param("id"), body,
  );
  return c.json({ asset });
});
