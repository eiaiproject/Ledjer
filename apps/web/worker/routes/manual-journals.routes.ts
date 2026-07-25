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
  postManualJournal,
  previewManualJournal,
  generateClosingJournalLines,
  listJournalTemplates,
  getJournalTemplate,
  saveJournalTemplate,
  deleteJournalTemplate,
  type JournalEntryType,
  type JournalLineInput,
} from "../services/manual-journals.service";

const entryTypeSchema = z.enum([
  "normal", "opening_balance", "adjustment", "reversal",
  "closing", "manual_journal",
]);

const journalLineSchema = z.object({
  accountId: z.string().min(1),
  debitMinor: z.number().int().min(0).default(0),
  creditMinor: z.number().int().min(0).default(0),
  description: z.string().max(500).default(""),
  partyId: z.string().nullable().optional(),
});

const postJournalSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entryType: entryTypeSchema.default("manual_journal"),
  description: z.string().min(1).max(1000),
  lines: z.array(journalLineSchema).min(2).max(100),
  idempotencyKey: z.string().min(8).max(160),
  reversedEntryId: z.string().nullable().optional(),
  reversalReason: z.string().nullable().optional(),
});

const saveTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  entryType: entryTypeSchema.default("manual_journal"),
  lines: z.array(journalLineSchema).min(2).max(100),
});

export const manualJournalRoutes = new Hono<AppContext>();

manualJournalRoutes.use("*", requireAuth());
manualJournalRoutes.use("*", loadCurrentOrganization());

// ── Journal endpoints ─────────────────────────────────────────────

manualJournalRoutes.post("/preview", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, postJournalSchema);
  const result = await previewManualJournal(c.env.DB, context.organization.id, body);
  return c.json(result);
});

manualJournalRoutes.post("/", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, postJournalSchema);
  const result = await postManualJournal(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
    c.get("requestId"),
  );
  return c.json(result);
});

manualJournalRoutes.get("/closing-preview", requirePermission("reports:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const closingDate = url.searchParams.get("closingDate");
  if (!closingDate) return c.json({ error: "closingDate required" }, 400);

  const result = await generateClosingJournalLines(
    c.env.DB,
    context.organization.id,
    closingDate,
  );
  return c.json(result);
});

manualJournalRoutes.post("/closing", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, z.object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    idempotencyKey: z.string().min(8).max(160),
  }));

  const { lines, totals } = await generateClosingJournalLines(
    c.env.DB,
    context.organization.id,
    body.entryDate,
  );

  if (lines.length === 0) {
    return c.json({ error: "No revenue or expense accounts to close" }, 400);
  }

  const result = await postManualJournal(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    {
      entryDate: body.entryDate,
      entryType: "closing",
      description: `Jurnal penutup periode ${body.entryDate}`,
      lines,
      idempotencyKey: body.idempotencyKey,
    },
    c.get("requestId"),
  );

  return c.json({ ...result, totals });
});

// ── Template endpoints ────────────────────────────────────────────

manualJournalRoutes.get("/templates", requirePermission("accounts:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const entryType = url.searchParams.get("entryType") as JournalEntryType | null;
  const templates = await listJournalTemplates(
    c.env.DB,
    context.organization.id,
    entryType ?? undefined,
  );
  return c.json({ templates });
});

manualJournalRoutes.get("/templates/:id", requirePermission("accounts:read"), async (c) => {
  const context = c.get("organizationContext");
  const template = await getJournalTemplate(
    c.env.DB,
    context.organization.id,
    c.req.param("id"),
  );
  return c.json({ template });
});

manualJournalRoutes.post("/templates", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, saveTemplateSchema);
  const template = await saveJournalTemplate(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
  );
  return c.json({ template });
});

manualJournalRoutes.delete("/templates/:id", requirePermission("accounts:write"), async (c) => {
  const context = c.get("organizationContext");
  await deleteJournalTemplate(c.env.DB, context.organization.id, c.req.param("id"));
  return c.json({ success: true });
});
