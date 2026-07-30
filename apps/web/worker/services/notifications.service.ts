// ponytail: Notification service for P2.7 Notification and Task Center.
// Provides CRUD for in-app notifications, generation from various sources,
// and querying for the notification bell and center page.

import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst, type D1Input } from "../db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | "overdue_receivable" | "upcoming_payable" | "low_stock"
  | "pending_approval" | "unclosed_period" | "team_invitation"
  | "import_failed" | "export_completed" | "backup_failed"
  | "role_changed" | "new_device_login"
  | "system";

export type NotificationSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface CreateNotificationInput {
  organizationId: string;
  recipientUserId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  createdBy?: string;
}

export interface NotificationOutput {
  id: string;
  organizationId: string;
  recipientUserId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  severity: NotificationSeverity;
  isRead: boolean;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: number;
  readAt: number | null;
}

export interface UnreadCount {
  total: number;
  byCategory: Record<string, number>;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createNotification(
  db: D1Database,
  input: CreateNotificationInput,
): Promise<NotificationOutput> {
  const id = generateId();
  const now = Date.now();
  const severity = input.severity ?? "info";

  await execute(
    db,
    `INSERT INTO notifications (
       id, organization_id, recipient_user_id, category,
       title, message, severity, is_read,
       action_url, entity_type, entity_id, created_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [
      id, input.organizationId, input.recipientUserId, input.category,
      input.title, input.message, severity,
      input.actionUrl ?? null, input.entityType ?? null, input.entityId ?? null,
      input.createdBy ?? "system", now,
    ],
  );

  return getNotification(db, id);
}

export async function getNotification(
  db: D1Database,
  id: string,
): Promise<NotificationOutput> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    "SELECT * FROM notifications WHERE id = ?",
    [id],
  );
  if (!row) throw new Error("Notification not found");
  return rowToOutput(row);
}

export async function listNotifications(
  db: D1Database,
  organizationId: string,
  userId: string,
  limit = 50,
  offset = 0,
  unreadOnly = false,
): Promise<NotificationOutput[]> {
  const unreadFilter = unreadOnly ? "AND is_read = 0" : "";

  try {
    const rows = await queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM notifications
       WHERE organization_id = ? AND recipient_user_id = ? ${unreadFilter}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [organizationId, userId, limit, offset],
    );

    return rows.map(rowToOutput);
  } catch {
    // Table may not exist yet in this environment — return empty list
    return [];
  }
}

export async function getUnreadCount(
  db: D1Database,
  organizationId: string,
  userId: string,
): Promise<UnreadCount> {
  try {
    const rows = await queryAll<{ category: string; cnt: number }>(
      db,
      `SELECT category, COUNT(*) as cnt
       FROM notifications
       WHERE organization_id = ? AND recipient_user_id = ? AND is_read = 0
       GROUP BY category`,
      [organizationId, userId],
    );

    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byCategory[r.category] = r.cnt;
      total += r.cnt;
    }

    return { total, byCategory };
  } catch {
    // Table may not exist yet in this environment — return zero count
    return { total: 0, byCategory: {} };
  }
}

export async function markAsRead(
  db: D1Database,
  notificationId: string,
): Promise<NotificationOutput> {
  const now = Date.now();
  await execute(
    db,
    "UPDATE notifications SET is_read = 1, read_at = ? WHERE id = ?",
    [now, notificationId],
  );
  return getNotification(db, notificationId);
}

export async function markAllAsRead(
  db: D1Database,
  organizationId: string,
  userId: string,
): Promise<number> {
  const now = Date.now();
  const result = await execute(
    db,
    `UPDATE notifications
     SET is_read = 1, read_at = ?
     WHERE organization_id = ? AND recipient_user_id = ? AND is_read = 0`,
    [now, organizationId, userId],
  );
  return result.meta.changes ?? 0;
}

export async function dismissNotification(
  db: D1Database,
  notificationId: string,
): Promise<void> {
  await execute(
    db,
    "DELETE FROM notifications WHERE id = ?",
    [notificationId],
  );
}

export async function dismissAll(
  db: D1Database,
  organizationId: string,
  userId: string,
  category?: NotificationCategory,
): Promise<number> {
  const categoryFilter = category ? "AND category = ?" : "";
  const params: D1Input[] = category
    ? [organizationId, userId, category]
    : [organizationId, userId];

  const result = await execute(
    db,
    `DELETE FROM notifications
     WHERE organization_id = ? AND recipient_user_id = ? ${categoryFilter}`,
    params,
  );
  return result.meta.changes ?? 0;
}

// ---------------------------------------------------------------------------
// Notification generators
// ---------------------------------------------------------------------------

/**
 * Generate notifications from actionable dashboard alerts.
 * Called periodically or after relevant mutations.
 */
export async function generateOverdueReceivableNotifications(
  db: D1Database,
  organizationId: string,
  adminUserIds: string[],
  overdueCount: number,
  totalOutstanding: number,
): Promise<number> {
  if (overdueCount <= 0) return 0;

  const category = "overdue_receivable" as NotificationCategory;
  const title = "Piutang Jatuh Tempo";
  const message = `${overdueCount} faktur dengan total Rp ${(totalOutstanding / 100).toLocaleString("id-ID")} belum dibayar.`;
  const severity = overdueCount > 5 ? "critical" : overdueCount > 2 ? "high" : "medium"; // NOSONAR typescript:S3358
  const actionUrl = "/invoices?status=overdue";

  return createForAllUsers(db, organizationId, adminUserIds, {
    category, title, message, severity, actionUrl, createdBy: "system",
  });
}

export async function generateLowStockNotifications(
  db: D1Database,
  organizationId: string,
  adminUserIds: string[],
  lowStockProducts: { count: number }[],
): Promise<number> {
  if (lowStockProducts.length <= 0) return 0;

  const category = "low_stock" as NotificationCategory;
  const title = "Stok Menipis";
  const message = `${lowStockProducts.length} produk memiliki stok di bawah minimum.`;
  const severity = lowStockProducts.length > 5 ? "high" : "medium";
  const actionUrl = "/products";

  return createForAllUsers(db, organizationId, adminUserIds, {
    category, title, message, severity, actionUrl, createdBy: "system",
  });
}

export async function generateUnclosedPeriodNotifications(
  db: D1Database,
  organizationId: string,
  adminUserIds: string[],
): Promise<number> {
  const category = "unclosed_period" as NotificationCategory;
  const title = "Periode Belum Ditutup";
  const message = "Periode akuntansi sebelumnya belum ditutup. Tutup periode untuk mengamankan data.";
  const severity = "medium";
  const actionUrl = "/settings/period-locks";

  return createForAllUsers(db, organizationId, adminUserIds, {
    category, title, message, severity, actionUrl, createdBy: "system",
  });
}

export async function generateDraftTransactionNotifications(
  db: D1Database,
  organizationId: string,
  adminUserIds: string[],
  draftCount: number,
): Promise<number> {
  if (draftCount <= 0) return 0;

  const category = "system" as NotificationCategory;
  const title = "Transaksi Draft";
  const message = `${draftCount} transaksi masih dalam status draft. Selesaikan segera.`;
  const severity = draftCount > 5 ? "medium" : "low";
  const actionUrl = "/transactions?status=draft";

  return createForAllUsers(db, organizationId, adminUserIds, {
    category, title, message, severity, actionUrl, createdBy: "system",
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dedup check: skip if there's already an unread notification of the same category
 * for this user created within the last hour.
 */
async function shouldCreateNotification(
  db: D1Database,
  organizationId: string,
  userId: string,
  category: NotificationCategory,
): Promise<boolean> {
  const recent = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM notifications
     WHERE organization_id = ?
       AND recipient_user_id = ?
       AND category = ?
       AND is_read = 0
       AND created_at > ?
     LIMIT 1`,
    [organizationId, userId, category, Date.now() - 3_600_000], // 1 hour ago
  );
  return recent === null;
}

async function createForAllUsers(
  db: D1Database,
  organizationId: string,
  userIds: string[],
  input: {
    category: NotificationCategory;
    title: string;
    message: string;
    severity: NotificationSeverity;
    actionUrl: string;
    createdBy: string;
  },
): Promise<number> {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  for (const uid of userIds) {
    // Dedup: skip if unread notification of same category exists within last hour
    const shouldCreate = await shouldCreateNotification(db, organizationId, uid, input.category);
    if (!shouldCreate) continue;

    const id = generateId();
    statements.push(
      db.prepare(
        `INSERT INTO notifications (
           id, organization_id, recipient_user_id, category,
           title, message, severity, is_read,
           action_url, created_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      ).bind(id, organizationId, uid, input.category, input.title, input.message,
        input.severity, input.actionUrl, input.createdBy, now),
    );
  }

  if (statements.length > 0) {
    await executeBatch(db, statements);
  }

  return statements.length;
}

function rowToOutput(row: Record<string, unknown>): NotificationOutput {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    recipientUserId: row.recipient_user_id as string,
    category: row.category as NotificationCategory,
    title: row.title as string,
    message: row.message as string,
    severity: row.severity as NotificationSeverity,
    isRead: (row.is_read as number) === 1,
    actionUrl: row.action_url as string | null,
    entityType: row.entity_type as string | null,
    entityId: row.entity_id as string | null,
    createdAt: row.created_at as number,
    readAt: row.read_at as number | null,
  };
}
