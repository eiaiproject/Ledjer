import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import { previewImport, executeImport } from "../services/import.service";
import { coaImportValidator, coaImportWriter } from "../services/import-coa.service";
import { productImportValidator, productImportWriter } from "../services/import-products.service";
import { partyImportValidator, partyImportWriter } from "../services/import-parties.service";

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

export default app;
