import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { parseListLimit, parseListOffset, parseSearch } from "../http/params";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import { createProduct, getStockMovementReport, listProductsPage, patchProduct } from "../services/products.service";
import type { ProductSort, ProductStockFilter } from "../services/products.service";

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

productsRoutes.get("/", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const status = params.get("status");
  const stock = params.get("stock") as ProductStockFilter | null;
  const sort = params.get("sort") as ProductSort | null;
  const limit = params.get("limit");
  const offset = params.get("offset");
  const { products, total } = await listProductsPage(c.env.DB, c.get("user").id, {
    // includeInactive lawas tetap didukung; status baru menang bila diisi.
    includeInactive: status ? status !== "active" : c.req.query("includeInactive") === "true",
    onlyInactive: status === "inactive",
    search: parseSearch(params.get("search")),
    stock: stock === "in" || stock === "out" || stock === "low" ? stock : undefined,
    sort: sort === "name" || sort === "stock_asc" || sort === "value_desc" ? sort : undefined,
    limit: parseListLimit(limit),
    offset: parseListOffset(offset),
  });
  return c.json({ products, total });
});

productsRoutes.post("/", async (c) => {
  const body = await readJson(c, createProductSchema);
  const product = await createProduct(
    c.env.DB,
    c.get("user").id,
    body,
    c.get("requestId"),
  );
  return c.json({ product });
});

productsRoutes.patch("/:productId", async (c) => {
  const body = await readJson(c, patchProductSchema);
  const product = await patchProduct(
    c.env.DB,
    c.get("user").id,
    c.req.param("productId"),
    body,
    c.get("requestId"),
  );
  return c.json({ product });
});

productsRoutes.get("/:productId/movements", async (c) => {
  const url = new URL(c.req.url);
  const params = url.searchParams;
  const movements = await getStockMovementReport(c.env.DB, c.get("user").id, {
    productId: c.req.param("productId"),
    fromDate: params.get("fromDate") ?? "0000-01-01",
    toDate: params.get("toDate") ?? "9999-12-31",
  });
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ movements });
});
