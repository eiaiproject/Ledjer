import { Hono } from "hono";
import type { AppContext } from "../env";
import { badRequest } from "../http/errors";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  csvHeaders,
  exportAccountsCsv,
  exportBalanceSheetCsv,
  exportGeneralLedgerCsv,
  exportProductsCsv,
  exportProfitLossCsv,
  exportTransactionsCsv,
  exportTrialBalanceCsv,
  type ExportResponse,
} from "../services/exports.service";
import {
  exportBalanceSheetPdf,
  exportGeneralLedgerPdf,
  exportProfitLossPdf,
  exportTrialBalancePdf,
  pdfHeaders,
  type PdfExportResponse,
} from "../services/pdf-export.service";

export const exportsRoutes = new Hono<AppContext>();

exportsRoutes.use("*", requireAuth());
exportsRoutes.use("*", loadCurrentOrganization());
exportsRoutes.use("*", requirePermission("exports:create"));

exportsRoutes.get("/accounts.csv", async (c) => {
  const context = c.get("organizationContext");
  return csvResponse(await exportAccountsCsv(c.env.DB, context.organization.id));
});

exportsRoutes.get("/products.csv", async (c) => {
  const context = c.get("organizationContext");
  return csvResponse(await exportProductsCsv(c.env.DB, context.organization.id));
});

exportsRoutes.get("/transactions.csv", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return csvResponse(await exportTransactionsCsv(c.env.DB, context.organization.id, {
    fromDate: params.get("fromDate") || undefined,
    toDate: params.get("toDate") || undefined,
    search: params.get("search") || undefined,
    transactionType: params.get("transactionType") || undefined,
    status: params.get("status") || undefined,
  }));
});

exportsRoutes.get("/reports/trial-balance.csv", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return csvResponse(await exportTrialBalanceCsv(
    c.env.DB,
    context.organization.id,
    requiredParam(params, "asOfDate"),
  ));
});

exportsRoutes.get("/reports/profit-loss.csv", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return csvResponse(await exportProfitLossCsv(
    c.env.DB,
    context.organization.id,
    requiredParam(params, "fromDate"),
    requiredParam(params, "toDate"),
  ));
});

exportsRoutes.get("/reports/balance-sheet.csv", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return csvResponse(await exportBalanceSheetCsv(
    c.env.DB,
    context.organization.id,
    requiredParam(params, "asOfDate"),
  ));
});

exportsRoutes.get("/reports/general-ledger.csv", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return csvResponse(await exportGeneralLedgerCsv(c.env.DB, context.organization.id, {
    accountId: params.get("accountId") || undefined,
    fromDate: requiredParam(params, "fromDate"),
    toDate: requiredParam(params, "toDate"),
  }));
});

// ── PDF exports (server-generated, identical on every device) ────────

exportsRoutes.get("/reports/trial-balance.pdf", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return pdfResponse(await exportTrialBalancePdf(
    c.env.DB,
    context.organization,
    requiredParam(params, "asOfDate"),
  ));
});

exportsRoutes.get("/reports/profit-loss.pdf", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return pdfResponse(await exportProfitLossPdf(
    c.env.DB,
    context.organization,
    requiredParam(params, "fromDate"),
    requiredParam(params, "toDate"),
  ));
});

exportsRoutes.get("/reports/balance-sheet.pdf", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return pdfResponse(await exportBalanceSheetPdf(
    c.env.DB,
    context.organization,
    requiredParam(params, "asOfDate"),
  ));
});

exportsRoutes.get("/reports/general-ledger.pdf", async (c) => {
  const context = c.get("organizationContext");
  const params = new URL(c.req.url).searchParams;
  return pdfResponse(await exportGeneralLedgerPdf(
    c.env.DB,
    context.organization,
    {
      accountId: params.get("accountId") || undefined,
      fromDate: requiredParam(params, "fromDate"),
      toDate: requiredParam(params, "toDate"),
    },
  ));
});

function csvResponse(exportResponse: ExportResponse): Response {
  return new Response(exportResponse.csv, {
    headers: csvHeaders(exportResponse.filename),
  });
}

function pdfResponse(exportResponse: PdfExportResponse): Response {
  return new Response(exportResponse.pdf, {
    headers: pdfHeaders(exportResponse.filename),
  });
}

function requiredParam(params: URLSearchParams, name: string): string {
  const value = params.get(name);
  if (!value) throw badRequest("missing_query_param", `${name} is required`);
  return value;
}
