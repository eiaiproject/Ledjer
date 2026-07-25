import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  createExportJob,
  getExportJob,
  listExportJobs,
  getExportDownload,
} from "../services/exports-v2.service";

const exportTypeSchema = z.enum([
  "transactions", "general_ledger", "trial_balance",
  "profit_loss", "balance_sheet", "accounts", "products",
]);

const createExportSchema = z.object({
  exportType: exportTypeSchema,
  parameters: z.record(z.string(), z.unknown()).optional(),
  format: z.enum(["csv", "xlsx"]).optional(),
});

export const exportsV2Routes = new Hono<AppContext>();

exportsV2Routes.use("*", requireAuth());
exportsV2Routes.use("*", loadCurrentOrganization() as any);
exportsV2Routes.use("*", requirePermission("exports:create"));

// ── Create export job ───────────────────────────────────────────

exportsV2Routes.post("/", async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, createExportSchema);

  const job = await createExportJob(
    { DB: c.env.DB, EXPORT_BUCKET: c.env.BACKUP_BUCKET },
    {
      organizationId: context.organization.id,
      exportType: body.exportType,
      parameters: body.parameters,
      format: body.format,
      userId: context.member.user_id,
    },
  );

  return c.json({ job });
});

// ── List export jobs ────────────────────────────────────────────

exportsV2Routes.get("/", async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);

  const jobs = await listExportJobs(c.env.DB, context.organization.id, {
    status: url.searchParams.get("status") as never ?? undefined,
    limit: parseInt(url.searchParams.get("limit") ?? "20", 10),
    offset: parseInt(url.searchParams.get("offset") ?? "0", 10),
  });

  return c.json({ jobs });
});

// ── Get export job status ───────────────────────────────────────

exportsV2Routes.get("/:id", async (c) => {
  const context = c.get("organizationContext");
  const job = await getExportJob(c.env.DB, context.organization.id, c.req.param("id"));
  if (!job) return c.json({ error: "Export job not found" }, 404 as any);
  return c.json({ job });
});

// ── Download export file ────────────────────────────────────────

exportsV2Routes.get("/:id/download", async (c) => {
  const context = c.get("organizationContext");
  const result = await getExportDownload(
    { DB: c.env.DB, EXPORT_BUCKET: c.env.BACKUP_BUCKET },
    context.organization.id,
    c.req.param("id"),
  );

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any);
  }

  return new Response(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
