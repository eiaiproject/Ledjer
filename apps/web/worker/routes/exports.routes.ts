import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { csvHeaders, exportTransactionsCsv, type ExportResponse } from "../services/exports.service";

export const exportsRoutes = new Hono<AppContext>();

exportsRoutes.use("*", requireAuth());
exportsRoutes.use("*", loadCurrentOrganization());
exportsRoutes.use("*", requirePermission("exports:create"));

exportsRoutes.get("/transactions.csv", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  const result = await exportTransactionsCsv(c.env.DB, context.organization.id, {
    fromDate: params.get("fromDate") || undefined,
    toDate: params.get("toDate") || undefined,
    search: params.get("search") || undefined,
    transactionType: params.get("transactionType") || undefined,
    status: params.get("status") || undefined,
  });
  return csvResponse(result);
});

function csvResponse(exportResponse: ExportResponse): Response {
  return new Response(exportResponse.csv, {
    headers: csvHeaders(exportResponse.filename),
  });
}