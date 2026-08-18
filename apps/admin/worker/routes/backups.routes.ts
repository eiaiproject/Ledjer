import { Hono } from "hono";
import type { AppContext } from "../env";
import { notFound } from "../http/errors";
import { listBackups, getBackupDetail, triggerBackup, runRestoreDrill } from "../services/admin-backups.service";
import { logAdminEvent } from "../services/admin-audit.service";

export const backupsRoutes = new Hono<AppContext>();

backupsRoutes.get("/", async (c) => {
  if (!c.env.BACKUP_BUCKET) {
    return c.json({ backups: [], total: 0, message: "BACKUP_BUCKET is not configured" });
  }
  const backups = await listBackups(c.env.BACKUP_BUCKET);
  return c.json({ backups, total: backups.length });
});

backupsRoutes.get("/drill", async (c) => {
  if (!c.env.BACKUP_BUCKET) throw notFound("backup_not_configured", "BACKUP_BUCKET is not configured");
  const drill = await runRestoreDrill(c.env.BACKUP_BUCKET);
  return c.json(drill);
});

backupsRoutes.get("/:date", async (c) => {
  if (!c.env.BACKUP_BUCKET) throw notFound("backup_not_configured", "BACKUP_BUCKET is not configured");
  const detail = await getBackupDetail(c.env.BACKUP_BUCKET, c.req.param("date"));
  if (!detail.completed && detail.errors.length > 0 && detail.tableCount === 0) {
    throw notFound("backup_not_found", "Backup not found");
  }
  return c.json(detail);
});

backupsRoutes.post("/", async (c) => {
  if (!c.env.BACKUP_BUCKET) throw notFound("backup_not_configured", "BACKUP_BUCKET is not configured");
  const session = c.get("adminSession");
  const result = await triggerBackup(c.env.DB, c.env.BACKUP_BUCKET);
  await logAdminEvent(c.env.DB, {
    actorAdminId: session.admin_user_id,
    actorEmail: session.email,
    entityType: "backup",
    entityId: result.summary.date,
    action: "backup_manual_triggered",
    after: { date: result.summary.date, totalRows: result.summary.totalRows, drillValid: result.drill.valid },
  });
  return c.json(result, 201);
});
