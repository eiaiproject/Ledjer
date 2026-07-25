// P3.1 Approval Workflow Service
// Manages approval requests for high-value actions, configurable thresholds,
// and integration with the notification system.

import { generateId } from "../auth/tokens";
import { execute, queryAll, queryFirst, statement, executeBatch } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, forbidden, notFound } from "../http/errors";
import { createNotification } from "./notifications.service";
import type { Permission } from "./organization.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionType =
  | "transaction_create"
  | "transaction_void"
  | "period_reopen"
  | "stock_adjustment"
  | "manual_journal";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalConfig {
  id: string;
  organizationId: string;
  actionType: ActionType;
  thresholdMinor: number;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApprovalConfigInput {
  actionType: ActionType;
  thresholdMinor: number;
  enabled: boolean;
}

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  actionType: ActionType;
  entityType: string;
  entityId: string;
  entitySummary: string | null;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: number;
  status: ApprovalStatus;
  approvedBy: string | null;
  approvedByName?: string | null;
  approvedAt: number | null;
  rejectionReason: string | null;
  decisionNote: string | null;
  amountMinor: number;
  metadata: Record<string, unknown> | null;
}

export interface CreateApprovalRequestInput {
  organizationId: string;
  actionType: ActionType;
  entityType: string;
  entityId: string;
  entitySummary?: string;
  requestedBy: string;
  amountMinor: number;
  metadata?: Record<string, unknown>;
}

const ACTION_LABELS: Record<ActionType, string> = {
  transaction_create: "Transaksi Baru",
  transaction_void: "Pembatalan Transaksi",
  period_reopen: "Pembukaan Periode",
  stock_adjustment: "Penyesuaian Stok",
  manual_journal: "Jurnal Manual",
};

const ACTION_PERMISSIONS: Record<ActionType, Permission> = {
  transaction_create: "transactions:create",
  transaction_void: "transactions:void",
  period_reopen: "organization:update",
  stock_adjustment: "products:write",
  manual_journal: "accounts:write",
};

// ---------------------------------------------------------------------------
// Approval Config CRUD
// ---------------------------------------------------------------------------

export async function getApprovalConfig(
  db: D1Database,
  organizationId: string,
  actionType: ActionType,
): Promise<ApprovalConfig | null> {
  const row = await queryFirst<{
    id: string;
    organization_id: string;
    action_type: string;
    threshold_minor: number;
    enabled: number;
    created_by: string;
    created_at: number;
    updated_at: number;
  }>(
    db,
    `SELECT * FROM approval_configs WHERE organization_id = ? AND action_type = ?`,
    [organizationId, actionType],
  );
  if (!row) return null;
  return toConfig(row);
}

export async function listApprovalConfigs(
  db: D1Database,
  organizationId: string,
): Promise<ApprovalConfig[]> {
  const rows = await queryAll<{
    id: string;
    organization_id: string;
    action_type: string;
    threshold_minor: number;
    enabled: number;
    created_by: string;
    created_at: number;
    updated_at: number;
  }>(
    db,
    `SELECT * FROM approval_configs WHERE organization_id = ? ORDER BY action_type`,
    [organizationId],
  );
  return rows.map(toConfig);
}

export async function upsertApprovalConfig(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: ApprovalConfigInput,
): Promise<ApprovalConfig> {
  const now = Date.now();
  const existing = await getApprovalConfig(db, organizationId, input.actionType);

  if (existing) {
    await execute(
      db,
      `UPDATE approval_configs SET threshold_minor = ?, enabled = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
      [input.thresholdMinor, input.enabled ? 1 : 0, userId, now, existing.id],
    );
    const updated = await getApprovalConfig(db, organizationId, input.actionType);
    return updated!;
  }

  const id = generateId();
  await execute(
    db,
    `INSERT INTO approval_configs (id, organization_id, action_type, threshold_minor, enabled, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, organizationId, input.actionType, input.thresholdMinor, input.enabled ? 1 : 0, userId, now, now],
  );

  return {
    id,
    organizationId,
    actionType: input.actionType,
    thresholdMinor: input.thresholdMinor,
    enabled: input.enabled,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Approval Request CRUD
// ---------------------------------------------------------------------------

/**
 * Check if an action requires approval based on organization config.
 * Returns the config if approval is needed, null if approval is not needed.
 */
export async function requiresApproval(
  db: D1Database,
  organizationId: string,
  actionType: ActionType,
  amountMinor: number,
): Promise<ApprovalConfig | null> {
  const config = await getApprovalConfig(db, organizationId, actionType);
  if (!config || !config.enabled) return null;
  if (config.thresholdMinor > 0 && amountMinor < config.thresholdMinor) return null;
  return config;
}

/**
 * Create an approval request. Does NOT check permissions — caller must verify.
 */
export async function createApprovalRequest(
  db: D1Database,
  input: CreateApprovalRequestInput,
): Promise<ApprovalRequest> {
  const id = generateId();
  const now = Date.now();
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

  await execute(
    db,
    `INSERT INTO approval_requests (
       id, organization_id, action_type, entity_type, entity_id, entity_summary,
       requested_by, requested_at, status, amount_minor, metadata
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id, input.organizationId, input.actionType, input.entityType, input.entityId,
      input.entitySummary ?? null, input.requestedBy, now, input.amountMinor, metadata,
    ],
  );

  // Notify all admins and owners about pending approval
  await notifyApprovalRequested(db, input.organizationId, input.requestedBy, {
    id,
    actionType: input.actionType,
    entitySummary: input.entitySummary ?? null,
    amountMinor: input.amountMinor,
  });

  return getApprovalRequest(db, id);
}

export async function getApprovalRequest(
  db: D1Database,
  approvalId: string,
): Promise<ApprovalRequest> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT ar.*, requester.full_name AS requested_by_name, approver.full_name AS approved_by_name
     FROM approval_requests ar
     LEFT JOIN users requester ON requester.id = ar.requested_by
     LEFT JOIN users approver ON approver.id = ar.approved_by
     WHERE ar.id = ?`,
    [approvalId],
  );
  if (!row) throw notFound("approval_not_found", "Approval request not found");
  return toRequest(row);
}

export async function listApprovalRequests(
  db: D1Database,
  organizationId: string,
  opts?: {
    status?: ApprovalStatus;
    actionType?: ActionType;
    limit?: number;
    offset?: number;
  },
): Promise<ApprovalRequest[]> {
  const conditions = ["ar.organization_id = ?"];
  const values: unknown[] = [organizationId];

  if (opts?.status) {
    conditions.push("ar.status = ?");
    values.push(opts.status);
  }
  if (opts?.actionType) {
    conditions.push("ar.action_type = ?");
    values.push(opts.actionType);
  }

  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  values.push(limit, offset);

  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT ar.*, requester.full_name AS requested_by_name, approver.full_name AS approved_by_name
     FROM approval_requests ar
     LEFT JOIN users requester ON requester.id = ar.requested_by
     LEFT JOIN users approver ON approver.id = ar.approved_by
     WHERE ${conditions.join(" AND ")}
     ORDER BY ar.requested_at DESC
     LIMIT ? OFFSET ?`,
    values,
  );

  return rows.map(toRequest);
}

export async function getPendingApprovalCount(
  db: D1Database,
  organizationId: string,
): Promise<number> {
  const row = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM approval_requests
     WHERE organization_id = ? AND status = 'pending'`,
    [organizationId],
  );
  return row?.count ?? 0;
}

/**
 * Approve a pending approval request.
 * Only admins and owners can approve requests.
 */
export async function approveApprovalRequest(
  db: D1Database,
  organizationId: string,
  approvalId: string,
  userId: string,
  note?: string,
): Promise<ApprovalRequest> {
  const request = await getApprovalRequest(db, approvalId);

  if (request.organizationId !== organizationId) {
    throw forbidden("approval_org_mismatch", "Approval request belongs to a different organization");
  }
  if (request.status !== "pending") {
    throw badRequest("approval_already_decided", `Approval request is already ${request.status}`);
  }
  if (request.requestedBy === userId) {
    throw badRequest("approval_self_approve", "You cannot approve your own request");
  }

  const now = Date.now();
  const statements = [
    statement(
      db,
      `UPDATE approval_requests
       SET status = 'approved', approved_by = ?, approved_at = ?, decision_note = ?
       WHERE id = ? AND organization_id = ? AND status = 'pending'`,
      [userId, now, note ?? null, approvalId, organizationId],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "approval_request",
      entityId: approvalId,
      action: "approval_approved",
      before: { status: "pending" },
      after: { status: "approved", approved_by: userId, decision_note: note ?? null },
      current: now,
    }),
  ];

  await executeBatch(db, statements);
  return getApprovalRequest(db, approvalId);
}

/**
 * Reject a pending approval request.
 */
export async function rejectApprovalRequest(
  db: D1Database,
  organizationId: string,
  approvalId: string,
  userId: string,
  reason: string,
  note?: string,
): Promise<ApprovalRequest> {
  const request = await getApprovalRequest(db, approvalId);

  if (request.organizationId !== organizationId) {
    throw forbidden("approval_org_mismatch", "Approval request belongs to a different organization");
  }
  if (request.status !== "pending") {
    throw badRequest("approval_already_decided", `Approval request is already ${request.status}`);
  }
  if (!reason || reason.trim().length < 5) {
    throw badRequest("rejection_reason_required", "Rejection reason must be at least 5 characters");
  }

  const now = Date.now();
  const trimmedReason = reason.trim();
  const statements = [
    statement(
      db,
      `UPDATE approval_requests
       SET status = 'rejected', approved_by = ?, approved_at = ?, rejection_reason = ?, decision_note = ?
       WHERE id = ? AND organization_id = ? AND status = 'pending'`,
      [userId, now, trimmedReason, note ?? null, approvalId, organizationId],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "approval_request",
      entityId: approvalId,
      action: "approval_rejected",
      before: { status: "pending" },
      after: { status: "rejected", rejected_by: userId, reason: trimmedReason },
      current: now,
    }),
  ];

  await executeBatch(db, statements);
  return getApprovalRequest(db, approvalId);
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

async function notifyApprovalRequested(
  db: D1Database,
  organizationId: string,
  requesterUserId: string,
  request: { id: string; actionType: ActionType; entitySummary: string | null; amountMinor: number },
): Promise<void> {
  // Find admin and owner users who can approve
  const admins = await queryAll<{ user_id: string }>(
    db,
    `SELECT m.user_id FROM organization_members m
     WHERE m.organization_id = ? AND m.status = 'active'
       AND (m.role = 'owner' OR m.role = 'admin')
       AND m.user_id != ?`,
    [organizationId, requesterUserId],
  );

  const label = ACTION_LABELS[request.actionType] ?? request.actionType;
  const amountFormatted = new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(request.amountMinor);

  const title = `Persetujuan ${label}`;
  const summary = request.entitySummary ?? `${label} - ${amountFormatted}`;
  const message = `Memerlukan persetujuan: ${summary}`;
  const actionUrl = `/approvals/${request.id}`;

  for (const admin of admins) {
    await createNotification(db, {
      organizationId,
      recipientUserId: admin.user_id,
      category: "pending_approval",
      title,
      message,
      severity: "medium",
      actionUrl,
      entityType: "approval_request",
      entityId: request.id,
      createdBy: "system",
    });
  }
}

// ---------------------------------------------------------------------------
// Hook: check before posting transaction / void / etc.
// ---------------------------------------------------------------------------

/**
 * Check if an action requires approval before proceeding.
 * If approval is needed, creates the request and returns it.
 * If no approval needed, returns null.
 * Throws if a pending approval already exists for the same entity+action.
 */
export async function requireApprovalOrContinue(
  db: D1Database,
  organizationId: string,
  requestedBy: string,
  actionType: ActionType,
  entityType: string,
  entityId: string,
  amountMinor: number,
  opts?: { entitySummary?: string; metadata?: Record<string, unknown> },
): Promise<ApprovalRequest | null> {
  const config = await requiresApproval(db, organizationId, actionType, amountMinor);
  if (!config) return null;

  // Check if there's already a pending request for this entity+action
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM approval_requests
     WHERE organization_id = ? AND entity_type = ? AND entity_id = ?
       AND action_type = ? AND status = 'pending'
     LIMIT 1`,
    [organizationId, entityType, entityId, actionType],
  );

  if (existing) {
    throw badRequest("approval_pending", "A pending approval request already exists for this action");
  }

  return createApprovalRequest(db, {
    organizationId,
    actionType,
    entityType,
    entityId,
    entitySummary: opts?.entitySummary,
    requestedBy,
    amountMinor,
    metadata: opts?.metadata,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toConfig(row: {
  id: string;
  organization_id: string;
  action_type: string;
  threshold_minor: number;
  enabled: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}): ApprovalConfig {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actionType: row.action_type as ActionType,
    thresholdMinor: row.threshold_minor,
    enabled: row.enabled === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRequest(row: Record<string, unknown>): ApprovalRequest {
  let parsedMeta: Record<string, unknown> | null = null;
  if (row.metadata && typeof row.metadata === "string") {
    try { parsedMeta = JSON.parse(row.metadata as string); } catch { parsedMeta = null; }
  }

  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    actionType: row.action_type as ActionType,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string,
    entitySummary: row.entity_summary as string | null,
    requestedBy: row.requested_by as string,
    requestedByName: row.requested_by_name as string | undefined,
    requestedAt: row.requested_at as number,
    status: row.status as ApprovalStatus,
    approvedBy: row.approved_by as string | null,
    approvedByName: row.approved_by_name as string | null,
    approvedAt: row.approved_at as number | null,
    rejectionReason: row.rejection_reason as string | null,
    decisionNote: row.decision_note as string | null,
    amountMinor: row.amount_minor as number,
    metadata: parsedMeta,
  };
}
