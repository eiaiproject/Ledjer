import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { badRequest } from "../http/errors";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { getBalanceSheet, getGeneralLedger, getProfitLoss } from "../services/reports.service";
import { getStockMovementReport } from "../services/products.service";

export const reportsRoutes = new Hono<AppContext>();

reportsRoutes.use("*", requireAuth());
reportsRoutes.use("*", loadCurrentOrganization());
reportsRoutes.use("*", requirePermission("reports:read"));

reportsRoutes.get("/profit-loss", async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const report = await getProfitLoss(
    c.env.DB,
    context.organization.id,
    requiredParam(url.searchParams, "fromDate"),
    requiredParam(url.searchParams, "toDate"),
  );
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ report });
});

reportsRoutes.get("/balance-sheet", async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const report = await getBalanceSheet(
    c.env.DB,
    context.organization.id,
    requiredParam(url.searchParams, "asOfDate"),
  );
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ report });
});

reportsRoutes.get("/general-ledger", async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const params = url.searchParams;
  const report = await getGeneralLedger(
    c.env.DB,
    context.organization.id,
    {
      accountId: params.get("accountId") || undefined,
      fromDate: requiredParam(params, "fromDate"),
      toDate: requiredParam(params, "toDate"),
      limit: optionalInteger(params.get("limit")),
      offset: optionalInteger(params.get("offset")),
    },
  );
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ report });
});

reportsRoutes.get("/stock-movements", async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const params = url.searchParams;
  const productId = params.get("productId") || undefined;
  const fromDate = requiredParam(params, "fromDate");
  const toDate = requiredParam(params, "toDate");
  const lines = await getStockMovementReport(c.env.DB, context.organization.id, {
    productId,
    fromDate,
    toDate,
  });
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ report: { fromDate, toDate, productId: productId ?? null, lines } });
});

function requiredParam(params: URLSearchParams, name: string): string {
  const value = params.get(name);
  if (!value) throw badRequest("missing_query_param", `${name} is required`);
  return value;
}

function optionalInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}