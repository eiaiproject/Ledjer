import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { createProduct, listProducts, patchProduct } from "../services/products.service";

const createProductSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(80),
  unit: z.string().min(1).max(20),
  sellingPriceIdr: z.number().int().nonnegative().default(0),
});

const patchProductSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  unit: z.string().min(1).max(20).optional(),
  sellingPriceIdr: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const productsRoutes = new Hono<AppContext>();

productsRoutes.use("*", requireAuth());
productsRoutes.use("*", loadCurrentOrganization());

productsRoutes.get("/", requirePermission("products:read"), async (c) => {
  const context = c.get("organizationContext");
  const products = await listProducts(c.env.DB, context.organization.id, {
    includeInactive: c.req.query("includeInactive") === "true",
  });
  return c.json({ products });
});

productsRoutes.post("/", requirePermission("products:write"), async (c) => {
  const context = c.get("organizationContext");
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