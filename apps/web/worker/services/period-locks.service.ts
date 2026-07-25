import { generateId } from "../auth/tokens";
import { queryAll, queryFirst, statement, executeBatch } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { normalizeDate } from "../http/date";
import { conflict, notFound, badRequest } from "../http/errors";
import { requireApprovalOrContinue } from "./approvals.service";

export interface PeriodLock {
  id: string;
  organizationId: string;
  lockedThroughDate: string;
  reason: string | null;
  lockedBy: string;
  createdAt: string;
}

export interface CreatePeriodLockInput {
  lockedThroughDate: string;
  reason?: string;
}

/**
 * Create a period lock. Blocks all transactions on or before the locked date.
 * Only owners and admins can create period locks.
 * Creates an immutable audit event.
 */
export async function createPeriodLock(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreatePeriodLockInput,
): Promise<PeriodLock> {
  const date = normalizeDate(input.lockedThroughDate, "locked_date_invalid");

  // Check for existing lock on or after this date
  const existing = await queryFirst<{ id: string; locked_through_date: string }>(
    db,
    `SELECT id, locked_through_date FROM period_locks
     WHERE organization_id = ?
       AND locked_through_date >= ?
     ORDER BY locked_through_date DESC
     LIMIT 1`,
    [organizationId, date],
  );

  if (existing) {
    throw conflict(
      "period_lock_overlaps",
      "A period lock already exists for this date or a later date",
    );
  }

  const current = Date.now();
  const id = generateId();
  const reason = input.reason?.trim() || null;

  // Find current effective lock for audit context
  const previousLock = await queryFirst<{ locked_through_date: string }>(
    db,
    `SELECT locked_through_date FROM period_locks
     WHERE organization_id = ?
     ORDER BY locked_through_date DESC
     LIMIT 1`,
    [organizationId],
  );

  const batchStatements = [
    statement(
      db,
      `INSERT INTO period_locks (
         id, organization_id, locked_through_date, reason,
         locked_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, organizationId, date, reason, userId, current, current],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "period_lock",
      entityId: id,
      action: previousLock ? "period_lock_extended" : "period_lock_created",
      before: previousLock
        ? { locked_through_date: previousLock.locked_through_date }
        : undefined,
      after: { locked_through_date: date, reason },
      reason,
      current,
    }),
  ];

  await executeBatch(db, batchStatements);

  return {
    id,
    organizationId,
    lockedThroughDate: date,
    reason,
    lockedBy: userId,
    createdAt: new Date(current).toISOString(),
  };
}

/**
 * List all period locks for an organization, ordered by date descending.
 */
export async function listPeriodLocks(
  db: D1Database,
  organizationId: string,
): Promise<PeriodLock[]> {
  const rows = await queryAll<{
    id: string;
    organization_id: string;
    locked_through_date: string;
    reason: string | null;
    locked_by: string;
    created_at: number;
  }>(
    db,
    `SELECT id, organization_id, locked_through_date, reason, locked_by, created_at
     FROM period_locks
     WHERE organization_id = ?
     ORDER BY locked_through_date DESC`,
    [organizationId],
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    lockedThroughDate: row.locked_through_date,
    reason: row.reason,
    lockedBy: row.locked_by,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Delete (reopen) a period lock. Only owners and admins can reopen.
 * Creates an immutable audit event preserving the original lock history.
 */
export async function deletePeriodLock(
  db: D1Database,
  organizationId: string,
  lockId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  const lock = await queryFirst<{ id: string; locked_through_date: string }>(
    db,
    `SELECT id, locked_through_date FROM period_locks
     WHERE id = ? AND organization_id = ?`,
    [lockId, organizationId],
  );

  if (!lock) {
    throw notFound("period_lock_not_found", "Period lock not found");
  }

  // Check if approval is needed for period reopening
  const reopenApproval = await requireApprovalOrContinue(
    db, organizationId, userId, "period_reopen", "period_lock", lockId, 0,
    { entitySummary: `Pembukaan periode ${lock.locked_through_date}` },
  );
  if (reopenApproval) {
    throw badRequest("approval_required",
      `This period reopening requires approval. Request ID: ${reopenApproval.id}. Please wait for an admin to approve it.`,
    );
  }

  // Find the next effective lock after deletion
  const remainingLock = await queryFirst<{ locked_through_date: string }>(
    db,
    `SELECT locked_through_date FROM period_locks
     WHERE organization_id = ?
       AND id != ?
     ORDER BY locked_through_date DESC
     LIMIT 1`,
    [organizationId, lockId],
  );

  const batchStatements = [
    statement(
      db,
      `DELETE FROM period_locks WHERE id = ? AND organization_id = ?`,
      [lockId, organizationId],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "period_lock",
      entityId: lockId,
      action: "period_lock_reopened",
      before: { locked_through_date: lock.locked_through_date },
      after: remainingLock
        ? { locked_through_date: remainingLock.locked_through_date }
        : { locked_through_date: null },
      reason: reason?.trim() || null,
      current: Date.now(),
    }),
  ];

  await executeBatch(db, batchStatements);
}

