import { Hono } from "hono";
import type { AppContext } from "../env";
import { badRequest } from "../http/errors";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import { getCashFlowStatement } from "../services/cash-flow.service";
import {
  getBalanceSheet,
  getGeneralLedger,
  getProfitLoss,
  getTrialBalance,
} from "../services/reports.service";

export const reportsRoutes = new Hono<AppContext>();

reportsRoutes.use("*", requireAuth());
reportsRoutes.use("*", loadCurrentOrganization());
reportsRoutes.use("*", requirePermission("reports:read"));

reportsRoutes.get("/trial-balance", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  const asOfDate = requiredParam(params, "asOfDate");
  const trialBalance = await getTrialBalance(c.env.DB, context.organization.id, asOfDate);
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ trialBalance });
});

reportsRoutes.get("/profit-loss", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  const profitLoss = await getProfitLoss(
    c.env.DB,
    context.organization.id,
    requiredParam(params, "fromDate"),
    requiredParam(params, "toDate"),
  );
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ profitLoss });
});

reportsRoutes.get("/balance-sheet", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  const balanceSheet = await getBalanceSheet(
    c.env.DB,
    context.organization.id,
    requiredParam(params, "asOfDate"),
  );
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ balanceSheet });
});

reportsRoutes.get("/general-ledger", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  const accountId = params.get("accountId") || undefined;
  const generalLedger = await getGeneralLedger(c.env.DB, context.organization.id, {
    accountId,
    fromDate: requiredParam(params, "fromDate"),
    toDate: requiredParam(params, "toDate"),
  });
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ generalLedger });
});

reportsRoutes.get("/cash-flow", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  const comparePeriod = params.get("comparePeriod") === "true";
  const cashFlow = await getCashFlowStatement(
    c.env.DB,
    context.organization.id,
    requiredParam(params, "fromDate"),
    requiredParam(params, "toDate"),
    comparePeriod,
  );
  c.res.headers.set("Cache-Control", "private, max-age=30");
  return c.json({ cashFlow });
});

function requiredParam(params: URLSearchParams, name: string): string {
  const value = params.get(name);
  if (!value) throw badRequest("missing_query_param", `${name} is required`);
  return value;
}
