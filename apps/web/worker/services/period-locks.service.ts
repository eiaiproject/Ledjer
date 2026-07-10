import { generateId } from "../auth/tokens";
import { execute, queryAll, queryFirst } from "../db/client";
import { badRequest, conflict, notFound } from "../http/errors";

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
 */
export async function createPeriodLock(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreatePeriodLockInput,
): Promise<PeriodLock> {
  const date = normalizeDate(input.lockedThroughDate, "locked_date_invalid");

  // Check for existing lock on or after this date
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM period_locks
     WHERE organization_id = ?
       AND locked_through_date >= ?
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

  await execute(
    db,
    `INSERT INTO period_locks (
       id, organization_id, locked_through_date, reason,
       locked_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      organizationId,
      date,
      input.reason?.trim() || null,
      userId,
      current,
      current,
    ],
  );

  return {
    id,
    organizationId,
    lockedThroughDate: date,
    reason: input.reason?.trim() || null,
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
 * Delete a period lock. Only the lock creator (or owner) can delete it.
 * Deleting a period lock unblocks the previously locked period.
 */
export async function deletePeriodLock(
  db: D1Database,
  organizationId: string,
  lockId: string,
): Promise<void> {
  const lock = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM period_locks
     WHERE id = ? AND organization_id = ?`,
    [lockId, organizationId],
  );

  if (!lock) {
    throw notFound("period_lock_not_found", "Period lock not found");
  }

  await execute(
    db,
    `DELETE FROM period_locks WHERE id = ? AND organization_id = ?`,
    [lockId, organizationId],
  );
}

function normalizeDate(input: string, code: string): string {
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(code, "Date must use YYYY-MM-DD format");
  }
  return value;
}
