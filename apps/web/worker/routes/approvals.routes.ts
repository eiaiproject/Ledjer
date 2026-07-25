import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { generateId } from "../auth/tokens";
import { queryFirst } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  listApprovalConfigs,
  upsertApprovalConfig,
  createApprovalRequest,
  listApprovalRequests,
  getApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  getPendingApprovalCount,
  type ActionType,
  type ApprovalStatus,
} from "../services/approvals.service";
import { badRequest } from "../http/errors";

const actionTypeSchema = z.enum([
  "transaction_create",
  "transaction_void",
  "period_reopen",
  "stock_adjustment",
  "manual_journal",
]);

const approvalStatusSchema = z.enum(["pending", "approved", "rejected"]);

const upsertConfigSchema = z.object({
  actionType: actionTypeSchema,
  thresholdMinor: z.number().min(0).default(0),
  enabled: z.boolean().default(false),
});

const createApprovalSchema = z.object({
  actionType: actionTypeSchema,
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(200),
  entitySummary: z.string().max(500).nullable().optional(),
  amountMinor: z.number().min(0).default(0),
  metadata: z.record(z.unknown()).nullable().optional(),
});

const approveSchema = z.object({
  note: z.string().max(1000).nullable().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(5).max(1000),
  note: z.string().max(1000).nullable().optional(),
});

export const approvalsRoutes = new Hono<AppContext>();

approvalsRoutes.use("*", requireAuth());
approvalsRoutes.use("*", loadCurrentOrganization());

// ── Config endpoints ─────────────────────────────────────────────

approvalsRoutes.get("/config", requirePermission("organization:read"), async (c) => {
  const context = c.get("organizationContext");
  const configs = await listApprovalConfigs(c.env.DB, context.organization.id);
  return c.json({ configs });
});

approvalsRoutes.put("/config", requirePermission("organization:update"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, upsertConfigSchema);
  const config = await upsertApprovalConfig(
    c.env.DB,
    context.organization.id,
    context.member.user_id,
    body,
  );
  return c.json({ config });
});

// ── Approval request endpoints ───────────────────────────────────

approvalsRoutes.get("/", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status") as ApprovalStatus | null;
  const actionType = url.searchParams.get("actionType") as ActionType | null;
  const limit = parseInteger(url.searchParams.get("limit")) ?? 20;
  const offset = parseInteger(url.searchParams.get("offset")) ?? 0;

  const requests = await listApprovalRequests(c.env.DB, context.organization.id, {
    status: status ?? undefined,
    actionType: actionType ?? undefined,
    limit,
    offset,
  });
  return c.json({ requests });
});

approvalsRoutes.get("/pending-count", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const count = await getPendingApprovalCount(c.env.DB, context.organization.id);
  return c.json({ count });
});

approvalsRoutes.post("/", requirePermission("transactions:create"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, createApprovalSchema);

  // Check for existing pending request
  const existing = await queryFirst<{ id: string }>(
    c.env.DB,
    `SELECT id FROM approval_requests
     WHERE organization_id = ? AND entity_type = ? AND entity_id = ?
       AND action_type = ? AND status = 'pending'
     LIMIT 1`,
    [context.organization.id, body.entityType, body.entityId, body.actionType],
  );
  if (existing) {
    throw badRequest("approval_pending", "A pending approval request already exists for this action");
  }

  const request = await createApprovalRequest(c.env.DB, {
    organizationId: context.organization.id,
    actionType: body.actionType,
    entityType: body.entityType,
    entityId: body.entityId,
    entitySummary: body.entitySummary ?? undefined,
    requestedBy: context.member.user_id,
    amountMinor: body.amountMinor,
    metadata: body.metadata ?? undefined,
  });
  return c.json({ request });
});

approvalsRoutes.get("/:id", requirePermission("transactions:read"), async (c) => {
  const context = c.get("organizationContext");
  const request = await getApprovalRequest(c.env.DB, c.req.param("id"));
  if (request.organizationId !== context.organization.id) {
    throw badRequest("approval_org_mismatch", "Approval belongs to a different organization");
  }
  return c.json({ request });
});

approvalsRoutes.post("/:id/approve", requirePermission("approvals:approve"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, approveSchema).catch(() => ({}));
  const request = await approveApprovalRequest(
    c.env.DB,
    context.organization.id,
    c.req.param("id"),
    context.member.user_id,
    body.note ?? undefined,
  );
  return c.json({ request });
});

approvalsRoutes.post("/:id/reject", requirePermission("approvals:approve"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, rejectSchema);
  const request = await rejectApprovalRequest(
    c.env.DB,
    context.organization.id,
    c.req.param("id"),
    context.member.user_id,
    body.reason,
    body.note ?? undefined,
  );
  return c.json({ request });
});

function parseInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
