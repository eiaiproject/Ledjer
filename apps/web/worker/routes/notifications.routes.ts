import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  dismissAll,
  generateOverdueReceivableNotifications,
  generateLowStockNotifications,
  
  generateDraftTransactionNotifications,
  type NotificationCategory,
} from "../services/notifications.service";

const app = new Hono<AppContext>();

// GET /api/notifications — list notifications
app.get("/", requireAuth, loadCurrentOrganization(), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const unreadOnly = c.req.query("unread") === "true";
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const notifications = await listNotifications(
    c.env.DB, organization.id, user.id, limit, offset, unreadOnly,
  );
  return c.json(notifications);
});

// GET /api/notifications/unread-count — get unread count
app.get("/unread-count", requireAuth, loadCurrentOrganization(), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const count = await getUnreadCount(c.env.DB, organization.id, user.id);
  return c.json(count);
});

// PATCH /api/notifications/:id/read — mark as read
app.patch("/:id/read", requireAuth, loadCurrentOrganization(), async (c) => {
  const result = await markAsRead(c.env.DB, c.req.param("id"));
  return c.json(result);
});

// POST /api/notifications/read-all — mark all as read
app.post("/read-all", requireAuth, loadCurrentOrganization(), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const count = await markAllAsRead(c.env.DB, organization.id, user.id);
  return c.json({ markedRead: count });
});

// DELETE /api/notifications/:id — dismiss a notification
app.delete("/:id", requireAuth, loadCurrentOrganization(), async (c) => {
  await dismissNotification(c.env.DB, c.req.param("id"));
  return c.json({ success: true });
});

// POST /api/notifications/dismiss-all — dismiss all (optionally by category)
app.post("/dismiss-all", requireAuth, loadCurrentOrganization(), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const body = await c.req.json<{ category?: NotificationCategory }>().catch(() => ({}));
  const count = await dismissAll(c.env.DB, organization.id, user.id, body.category);
  return c.json({ dismissed: count });
});

// POST /api/notifications/generate — manually trigger notification generation
app.post("/generate", requireAuth, loadCurrentOrganization(), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");

  // Get admin user IDs for this org
  const adminRows = await c.env.DB.prepare(
    `SELECT user_id FROM organization_members
     WHERE organization_id = ? AND role IN ('owner', 'admin')`,
  ).bind(organization.id).all<{ user_id: string }>();
  const adminUserIds = adminRows.results.map((r) => r.user_id);

  let generated = 0;

  // Overdue receivables
  const overdueRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_minor - paid_minor), 0) as total
     FROM invoices
     WHERE organization_id = ? AND status IN ('overdue', 'partially_paid')
       AND due_date < date('now')`,
  ).bind(organization.id).first<{ cnt: number; total: number }>();
  if (overdueRow) {
    generated += await generateOverdueReceivableNotifications(
      c.env.DB, organization.id, adminUserIds, overdueRow.cnt, overdueRow.total,
    );
  }

  // Low stock
  const lowStockRows = await c.env.DB.prepare(
    `SELECT p.id FROM products p
     WHERE p.organization_id = ? AND p.is_active = 1
       AND p.current_stock_milli <= p.min_stock_milli`,
  ).bind(organization.id).all<{ id: string }>();
  if (lowStockRows.results.length > 0) {
    generated += await generateLowStockNotifications(
      c.env.DB, organization.id, adminUserIds, lowStockRows.results,
    );
  }

  // Draft transactions
  const draftRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM transactions
     WHERE organization_id = ? AND status = 'draft'`,
  ).bind(organization.id).first<{ cnt: number }>();
  if (draftRow && draftRow.cnt > 0) {
    generated += await generateDraftTransactionNotifications(
      c.env.DB, organization.id, adminUserIds, draftRow.cnt,
    );
  }

  return c.json({ generated });
});

export default app;
