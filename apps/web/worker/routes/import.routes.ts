import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import { queryAll } from "../db/client";
import { previewImport, executeImport, undoImport } from "../services/import.service";
import { coaImportValidator, coaImportWriter } from "../services/import-coa.service";
import { productImportValidator, productImportWriter } from "../services/import-products.service";
import { partyImportValidator, partyImportWriter } from "../services/import-parties.service";
import { createOpeningBalanceValidator, openingBalanceImportWriter } from "../services/import-opening-balance.service";

const app = new Hono<AppContext>();

// --- CoA ---
app.post("/coa/preview", requireAuth, loadCurrentOrganization(), requirePermission("accounts:write"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const result = await previewImport(body.csv, coaImportValidator);
  return c.json(result);
});

app.post("/coa/execute", requireAuth, loadCurrentOrganization(), requirePermission("accounts:write"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const result = await executeImport(c.env.DB, organization.id, user.id, body.csv, coaImportValidator, coaImportWriter, "coa_import");
  return c.json(result);
});

// --- Products ---
app.post("/products/preview", requireAuth, loadCurrentOrganization(), requirePermission("products:write"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const result = await previewImport(body.csv, productImportValidator);
  return c.json(result);
});

app.post("/products/execute", requireAuth, loadCurrentOrganization(), requirePermission("products:write"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const result = await executeImport(c.env.DB, organization.id, user.id, body.csv, productImportValidator, productImportWriter, "product_import");
  return c.json(result);
});

// --- Parties ---
app.post("/parties/preview", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const result = await previewImport(body.csv, partyImportValidator);
  return c.json(result);
});

app.post("/parties/execute", requireAuth, loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const result = await executeImport(c.env.DB, organization.id, user.id, body.csv, partyImportValidator, partyImportWriter, "party_import");
  return c.json(result);
});

// --- Opening Balances ---
app.post("/opening-balance/preview", requireAuth, loadCurrentOrganization(), requirePermission("accounts:write"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const { organization } = c.get("organizationContext");

  // Pre-fetch accounts by code for validation
  const accounts = await queryAll<{ code: string; id: string }>(
    c.env.DB,
    `SELECT code, id FROM accounts WHERE organization_id = ?`,
    [organization.id],
  );
  const accountsByCode: Record<string, { id: string }> = {};
  for (const a of accounts) {
    accountsByCode[a.code] = { id: a.id };
  }

  const validator = createOpeningBalanceValidator(accountsByCode);
  const result = await previewImport(body.csv, validator);
  return c.json(result);
});

app.post("/opening-balance/execute", requireAuth, loadCurrentOrganization(), requirePermission("accounts:write"), async (c) => {
  const body = await c.req.json<{ csv: string }>();
  if (!body.csv || typeof body.csv !== "string") throw badRequest("csv_required", "CSV content required");
  const { user } = c.var;
  const { organization } = c.get("organizationContext");

  // Pre-fetch accounts by code
  const accounts = await queryAll<{ code: string; id: string }>(
    c.env.DB,
    `SELECT code, id FROM accounts WHERE organization_id = ?`,
    [organization.id],
  );
  const accountsByCode: Record<string, { id: string }> = {};
  for (const a of accounts) {
    accountsByCode[a.code] = { id: a.id };
  }

  const validator = createOpeningBalanceValidator(accountsByCode);
  const result = await executeImport(c.env.DB, organization.id, user.id, body.csv, validator, openingBalanceImportWriter, "opening_balance_import");
  return c.json(result);
});

// --- Undo Import ---
app.post("/:type/undo", requireAuth, loadCurrentOrganization(), requirePermission("accounts:write"), async (c) => {
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{ importId: string }>();
  if (!body.importId) throw badRequest("import_id_required", "importId required");
  const result = await undoImport(c.env.DB, organization.id, body.importId);
  return c.json(result);
});

export default app;
