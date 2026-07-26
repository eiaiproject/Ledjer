import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import { tooManyRequests } from "../http/errors";
import { checkRateLimit } from "../services/rate-limit.service";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  createProduct,
  deactivateProduct,
  getProduct,
  listProducts,
  patchProduct,
} from "../services/products.service";

const createProductSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  unit: z.string().min(1).max(32),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  currentStock: z.number().min(0),
  minStock: z.number().min(0),
  idempotencyKey: z.string().min(8).max(160).optional(),
});

const patchProductSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  unit: z.string().min(1).max(32).optional(),
  sellingPrice: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

export const productsRoutes = new Hono<AppContext>();

productsRoutes.use("*", requireAuth());
productsRoutes.use("*", loadCurrentOrganization());

productsRoutes.get("/", requirePermission("products:read"), async (c) => {
  const context = c.get("organizationContext");
  const includeInactive = new URL(c.req.url).searchParams.get("includeInactive") === "true";
  const products = await listProducts(c.env.DB, context.organization.id, !includeInactive);
  return c.json({ products });
});

productsRoutes.post("/", requirePermission("products:write"), async (c) => {
  const context = c.get("organizationContext");
  if (await checkRateLimit(c.env.DB, "products_create", context.member.user_id, { max: 20, windowMs: 60000 })) {
    throw tooManyRequests("Too many requests");
  }
  const body = await readJson(c, createProductSchema);
  const product = await createProduct(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
    c.get("requestId"),
  );
  return c.json({ product });
});

productsRoutes.get("/:productId", requirePermission("products:read"), async (c) => {
  const context = c.get("organizationContext");
  const product = await getProduct(
    c.env.DB,
    context.organization.id,
    c.req.param("productId"),
  );
  return c.json({ product });
});

productsRoutes.patch("/:productId", requirePermission("products:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, patchProductSchema);
  const product = await patchProduct(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    c.req.param("productId"),
    body,
    c.get("requestId"),
  );
  return c.json({ product });
});

productsRoutes.delete("/:productId", requirePermission("products:write"), async (c) => {
  const context = c.get("organizationContext");
  const product = await deactivateProduct(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    c.req.param("productId"),
    c.get("requestId"),
  );
  return c.json({ product });
});
