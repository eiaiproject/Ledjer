import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import { previewImport, executeImport } from "../services/import.service";
import { coaImportValidator, coaImportWriter } from "../services/import-coa.service";

const app = new Hono<AppContext>();

app.post(
  "/coa/preview",
  requireAuth,
  loadCurrentOrganization(),
  requirePermission("accounts:write"),
  async (c) => {
    const body = await c.req.json<{ csv: string }>();
    if (!body.csv || typeof body.csv !== "string") {
      throw badRequest("csv_required", "CSV content required");
    }
    const result = await previewImport(body.csv, coaImportValidator);
    return c.json(result);
  },
);

app.post(
  "/coa/execute",
  requireAuth,
  loadCurrentOrganization(),
  requirePermission("accounts:write"),
  async (c) => {
    const body = await c.req.json<{ csv: string }>();
    if (!body.csv || typeof body.csv !== "string") {
      throw badRequest("csv_required", "CSV content required");
    }
    const { user } = c.var;
    const { organization } = c.get("organizationContext");
    const result = await executeImport(
      c.env.DB,
      organization.id,
      user.id,
      body.csv,
      coaImportValidator,
      coaImportWriter,
      "coa_import",
    );
    return c.json(result);
  },
);

export default app;
