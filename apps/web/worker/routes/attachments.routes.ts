import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { loadCurrentOrganization, requirePermission } from "../middleware/organization.middleware";
import { badRequest } from "../http/errors";
import {
  uploadAttachment,
  getAttachment,
  deleteAttachment,
  listAttachments,
} from "../services/attachments.service";

const app = new Hono<AppContext>();

function getBucket(env: { BACKUP_BUCKET?: R2Bucket }): R2Bucket {
  if (!env.BACKUP_BUCKET) throw badRequest("storage_unavailable", "Penyimpanan file tidak tersedia");
  return env.BACKUP_BUCKET;
}

app.post("/upload", requireAuth(), loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const bucket = getBucket(c.env);

  const formData = await c.req.raw.formData();
  const file = formData.get("file") as File | null;
  if (!file) throw badRequest("file_required", "File diperlukan");

  const entityType = (formData.get("entity_type") as string) || "transaction";
  const entityId = formData.get("entity_id") as string;
  const transactionId = formData.get("transaction_id") as string | null;
  if (!entityId) throw badRequest("entity_required", "entity_id diperlukan");

  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await uploadAttachment(
    c.env.DB, bucket, organization.id, user.id,
    entityType, entityId, transactionId ?? null, file.name, bytes,
  );
  return c.json(result, 201);
});

app.get("/:id/download", requireAuth(), loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const bucket = getBucket(c.env);
  const { info, stream } = await getAttachment(c.env.DB, bucket, organization.id, c.req.param("id"));
  return new Response(stream, {
    headers: {
      "Content-Type": info.mimeType,
      "Content-Disposition": `inline; filename="${info.fileName}"`,
      "Content-Length": String(info.fileSize),
    },
  });
});

app.delete("/:id", requireAuth(), loadCurrentOrganization(), requirePermission("transactions:create"), async (c) => {
  const { user } = c.var;
  const { organization } = c.get("organizationContext");
  const bucket = getBucket(c.env);
  await deleteAttachment(c.env.DB, bucket, organization.id, user.id, c.req.param("id"));
  return c.json({ success: true });
});

app.get("/", requireAuth(), loadCurrentOrganization(), async (c) => {
  const { organization } = c.get("organizationContext");
  const entityType = c.req.query("entity_type") || "transaction";
  const entityId = c.req.query("entity_id");
  if (!entityId) throw badRequest("entity_required", "entity_id diperlukan");
  const result = await listAttachments(c.env.DB, organization.id, entityType, entityId);
  return c.json({ attachments: result });
});

export default app;
