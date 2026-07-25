// P3.6 Branches, Projects, and Cost Centers — Dimensional Accounting
// Lightweight dimension system using a single dimensions table and
// transaction_tags / journal_line_tags junction tables.

import { queryAll, queryFirst, execute, executeBatch } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, notFound } from "../http/errors";
import { generateId } from "../auth/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DimensionType = "branch" | "department" | "project" | "cost_center" | "profit_center";

export interface Dimension {
  id: string;
  organizationId: string;
  dimensionType: DimensionType;
  code: string;
  name: string;
  description: string;
  parentId: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionTag {
  id: string;
  organizationId: string;
  transactionId: string;
  dimensionId: string;
  dimensionCode?: string;
  dimensionName?: string;
  dimensionType?: DimensionType;
  createdBy: string;
  createdAt: number;
}

export interface JournalLineTag {
  id: string;
  organizationId: string;
  journalLineId: string;
  dimensionId: string;
  allocationPercent: number;
  dimensionCode?: string;
  dimensionName?: string;
  dimensionType?: DimensionType;
  createdBy: string;
  createdAt: number;
}

export interface DimensionReportRow {
  dimensionId: string;
  dimensionCode: string;
  dimensionName: string;
  dimensionType: DimensionType;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  transactionCount: number;
}

export interface DimensionReportSummary {
  dimensionType: DimensionType;
  periodFrom: string;
  periodTo: string;
  rows: DimensionReportRow[];
  totalDebit: number;
  totalCredit: number;
}

// ---------------------------------------------------------------------------
// Dimension CRUD
// ---------------------------------------------------------------------------

export async function listDimensions(
  db: D1Database,
  organizationId: string,
  opts?: {
    dimensionType?: DimensionType;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<Dimension[]> {
  const conditions: string[] = ["d.organization_id = ?"];
  const params: unknown[] = [organizationId];

  if (opts?.dimensionType) {
    conditions.push("d.dimension_type = ?");
    params.push(opts.dimensionType);
  }
  if (opts?.isActive !== undefined) {
    conditions.push("d.is_active = ?");
    params.push(opts.isActive ? 1 : 0);
  }

  const where = conditions.join(" AND ");
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT d.*, p.name as parent_name
     FROM dimensions d
     LEFT JOIN dimensions p ON p.id = d.parent_id
     WHERE ${where}
     ORDER BY d.dimension_type ASC, d.code ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return rows.map(rowToDimension);
}

export async function getDimension(
  db: D1Database,
  organizationId: string,
  dimensionId: string,
): Promise<Dimension | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT d.*, p.name as parent_name
     FROM dimensions d
     LEFT JOIN dimensions p ON p.id = d.parent_id
     WHERE d.id = ? AND d.organization_id = ?`,
    [dimensionId, organizationId],
  );

  return row ? rowToDimension(row) : null;
}

export async function createDimension(
  db: D1Database,
  organizationId: string,
  userId: string,
  data: {
    dimensionType: DimensionType;
    code: string;
    name: string;
    description?: string;
    parentId?: string | null;
  },
): Promise<Dimension> {
  // Check for duplicate code within type
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM dimensions
     WHERE organization_id = ? AND dimension_type = ? AND code = ? AND is_active = 1
     LIMIT 1`,
    [organizationId, data.dimensionType, data.code],
  );
  if (existing) {
    throw badRequest("dimension_code_exists",
      `Kode '${data.code}' sudah digunakan untuk tipe '${data.dimensionType}'`);
  }

  // Validate parent if provided
  if (data.parentId) {
    const parent = await getDimension(db, organizationId, data.parentId);
    if (!parent) throw badRequest("dimension_parent_not_found", "Parent dimensi tidak ditemukan");
  }

  const now = Date.now();
  const id = generateId();

  await execute(
    db,
    `INSERT INTO dimensions (id, organization_id, dimension_type, code, name, description,
      parent_id, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, organizationId, data.dimensionType, data.code, data.name,
     data.description ?? "", data.parentId ?? null, userId, now, now],
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "dimension",
    entityId: id,
    action: "dimension_created",
    before: null,
    after: data,
    reason: null,
    current: now,
  });

  return (await getDimension(db, organizationId, id))!;
}

export async function updateDimension(
  db: D1Database,
  organizationId: string,
  userId: string,
  dimensionId: string,
  data: Partial<{
    name: string;
    description: string;
    parentId: string | null;
    isActive: boolean;
  }>,
): Promise<Dimension> {
  const existing = await getDimension(db, organizationId, dimensionId);
  if (!existing) throw notFound("dimension_not_found", "Dimensi tidak ditemukan");

  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (data.name !== undefined) { sets.push("name = ?"); params.push(data.name); }
  if (data.description !== undefined) { sets.push("description = ?"); params.push(data.description); }
  if (data.parentId !== undefined) {
    // Validate parent
    if (data.parentId) {
      const parent = await getDimension(db, organizationId, data.parentId);
      if (!parent) throw badRequest("dimension_parent_not_found", "Parent dimensi tidak ditemukan");
      // Prevent circular reference
      if (data.parentId === dimensionId) {
        throw badRequest("dimension_circular", "Dimensi tidak bisa menjadi parent dirinya sendiri");
      }
    }
    sets.push("parent_id = ?"); params.push(data.parentId);
  }
  if (data.isActive !== undefined) {
    sets.push("is_active = ?");
    params.push(data.isActive ? 1 : 0);
  }

  params.push(dimensionId, organizationId);

  await execute(
    db,
    `UPDATE dimensions SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`,
    params,
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "dimension",
    entityId: dimensionId,
    action: "dimension_updated",
    before: existing,
    after: data,
    reason: null,
    current: now,
  });

  return (await getDimension(db, organizationId, dimensionId))!;
}

export async function deleteDimension(
  db: D1Database,
  organizationId: string,
  userId: string,
  dimensionId: string,
): Promise<void> {
  const existing = await getDimension(db, organizationId, dimensionId);
  if (!existing) throw notFound("dimension_not_found", "Dimensi tidak ditemukan");

  // Check for child dimensions
  const children = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM dimensions WHERE parent_id = ? AND is_active = 1`,
    [dimensionId],
  );
  if (children && children.count > 0) {
    throw badRequest("dimension_has_children",
      `Dimensi ini memiliki ${children.count} dimensi anak. Hapus atau pindahkan anak terlebih dahulu.`);
  }

  const now = Date.now();

  // Soft delete: deactivate
  await executeBatch(db, [
    execute(db,
      `UPDATE dimensions SET is_active = 0, updated_at = ? WHERE id = ? AND organization_id = ?`,
      [now, dimensionId, organizationId],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "dimension",
      entityId: dimensionId,
      action: "dimension_deleted",
      before: existing,
      after: null,
      reason: null,
      current: now,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Transaction Tags
// ---------------------------------------------------------------------------

export async function getTransactionTags(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<TransactionTag[]> {
  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT tt.*, d.code as dimension_code, d.name as dimension_name, d.dimension_type
     FROM transaction_tags tt
     JOIN dimensions d ON d.id = tt.dimension_id AND d.organization_id = tt.organization_id
     WHERE tt.organization_id = ? AND tt.transaction_id = ?
     ORDER BY d.dimension_type ASC`,
    [organizationId, transactionId],
  );

  return rows.map((r) => ({
    id: r.id as string,
    organizationId: r.organization_id as string,
    transactionId: r.transaction_id as string,
    dimensionId: r.dimension_id as string,
    dimensionCode: r.dimension_code as string,
    dimensionName: r.dimension_name as string,
    dimensionType: r.dimension_type as DimensionType,
    createdBy: r.created_by as string,
    createdAt: r.created_at as number,
  }));
}

export async function setTransactionTags(
  db: D1Database,
  organizationId: string,
  userId: string,
  transactionId: string,
  dimensionIds: string[],
): Promise<TransactionTag[]> {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  // Remove existing tags
  statements.push(
    execute(db,
      `DELETE FROM transaction_tags WHERE organization_id = ? AND transaction_id = ?`,
      [organizationId, transactionId],
    ),
  );

  // Add new tags
  const tags: TransactionTag[] = [];
  for (const dimId of dimensionIds) {
    const id = generateId();
    statements.push(
      execute(db,
        `INSERT INTO transaction_tags (id, organization_id, transaction_id, dimension_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, organizationId, transactionId, dimId, userId, now],
      ),
    );
    tags.push({
      id,
      organizationId,
      transactionId,
      dimensionId: dimId,
      createdBy: userId,
      createdAt: now,
    });
  }

  statements.push(
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction_tag",
      entityId: transactionId,
      action: "transaction_tags_updated",
      before: null,
      after: { transactionId, dimensionIds },
      reason: null,
      current: now,
    }),
  );

  await executeBatch(db, statements);

  return getTransactionTags(db, organizationId, transactionId);
}

// ---------------------------------------------------------------------------
// Dimensional Reports
// ---------------------------------------------------------------------------

/**
 * Get a dimensional report: summarize journal activity by dimension.
 * Single-dimension view (one dimension type at a time).
 */
export async function getDimensionReport(
  db: D1Database,
  organizationId: string,
  dimensionType: DimensionType,
  periodFrom: string,
  periodTo: string,
): Promise<DimensionReportSummary> {
  // Use transaction_tags to link transactions → journal entries → journal lines
  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT
       d.id as dimension_id,
       d.code as dimension_code,
       d.name as dimension_name,
       d.dimension_type,
       COALESCE(SUM(
         CASE WHEN a.normal_balance = 'debit' THEN jl.debit_minor - jl.credit_minor
              ELSE jl.credit_minor - jl.debit_minor END
       ), 0) as net_amount,
       COUNT(DISTINCT tt.transaction_id) as transaction_count
     FROM dimensions d
     JOIN transaction_tags tt ON tt.dimension_id = d.id AND tt.organization_id = d.organization_id
     JOIN transactions t ON t.id = tt.transaction_id AND t.organization_id = tt.organization_id
     LEFT JOIN journal_entries je ON je.transaction_id = t.id AND je.organization_id = t.organization_id
     LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id AND jl.organization_id = je.organization_id
     LEFT JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
     WHERE d.organization_id = ?
       AND d.dimension_type = ?
       AND d.is_active = 1
       AND t.status = 'posted'
       AND t.transaction_date >= ?
       AND t.transaction_date <= ?
     GROUP BY d.id, d.code, d.name, d.dimension_type
     ORDER BY d.code ASC`,
    [organizationId, dimensionType, periodFrom, periodTo],
  );

  let totalDebit = 0;
  let totalCredit = 0;

  const reportRows: DimensionReportRow[] = rows.map((r) => {
    const net = (r.net_amount as number) ?? 0;
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? Math.abs(net) : 0;
    totalDebit += debit;
    totalCredit += credit;

    return {
      dimensionId: r.dimension_id as string,
      dimensionCode: r.dimension_code as string,
      dimensionName: r.dimension_name as string,
      dimensionType: r.dimension_type as DimensionType,
      totalDebit: debit,
      totalCredit: credit,
      netAmount: net,
      transactionCount: (r.transaction_count as number) ?? 0,
    };
  });

  // If no rows, we still want to show all active dimensions with zero amounts
  if (reportRows.length === 0) {
    const dims = await queryAll<Record<string, unknown>>(
      db,
      `SELECT id as dimension_id, code as dimension_code, name as dimension_name, dimension_type
       FROM dimensions
       WHERE organization_id = ? AND dimension_type = ? AND is_active = 1
       ORDER BY code ASC`,
      [organizationId, dimensionType],
    );
    for (const d of dims) {
      reportRows.push({
        dimensionId: d.dimension_id as string,
        dimensionCode: d.dimension_code as string,
        dimensionName: d.dimension_name as string,
        dimensionType: d.dimension_type as DimensionType,
        totalDebit: 0,
        totalCredit: 0,
        netAmount: 0,
        transactionCount: 0,
      });
    }
  }

  return {
    dimensionType,
    periodFrom,
    periodTo,
    rows: reportRows,
    totalDebit,
    totalCredit,
  };
}

/**
 * Get dimensions with transaction counts (for dashboard widgets).
 */
export async function getDimensionSummary(
  db: D1Database,
  organizationId: string,
): Promise<{
  type: DimensionType;
  count: number;
  activeCount: number;
}[]> {
  const rows = await queryAll<{ dimension_type: DimensionType; count: number; active_count: number }>(
    db,
    `SELECT
       dimension_type,
       COUNT(*) as count,
       SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_count
     FROM dimensions
     WHERE organization_id = ?
     GROUP BY dimension_type
     ORDER BY dimension_type ASC`,
    [organizationId],
  );

  return rows.map((r) => ({
    type: r.dimension_type,
    count: r.count,
    activeCount: r.active_count,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIMENSION_TYPE_LABELS: Record<DimensionType, string> = {
  branch: "Cabang",
  department: "Departemen",
  project: "Proyek",
  cost_center: "Pusat Biaya",
  profit_center: "Pusat Laba",
};

export function dimensionTypeLabel(type: DimensionType): string {
  return DIMENSION_TYPE_LABELS[type] ?? type;
}

function rowToDimension(row: Record<string, unknown>): Dimension {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    dimensionType: row.dimension_type as DimensionType,
    code: row.code as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    parentId: (row.parent_id as string) ?? null,
    isActive: (row.is_active as number) === 1,
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
