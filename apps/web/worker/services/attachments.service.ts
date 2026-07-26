// ponytail: File-type validation via magic bytes. Only allows safe document/image
// types. Size limit enforced server-side. Upgrade: virus scanning via external API,
// thumbnail generation for images, OCR for receipt extraction.

import { generateId } from "../auth/tokens";
import { execute, queryAll, queryFirst } from "../db/client";
import { badRequest, notFound } from "../http/errors";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Magic bytes for allowed types
const ALLOWED_TYPES: Record<string, { magic: number[]; mime: string; ext: string }[]> = {
  "image/jpeg": [{ magic: [0xFF, 0xD8, 0xFF], mime: "image/jpeg", ext: "jpg" }],
  "image/png": [{ magic: [0x89, 0x50, 0x4E, 0x47], mime: "image/png", ext: "png" }],
  "image/gif": [{ magic: [0x47, 0x49, 0x46], mime: "image/gif", ext: "gif" }],
  "image/webp": [{ magic: [0x52, 0x49, 0x46, 0x46], mime: "image/webp", ext: "webp" }],
  "application/pdf": [{ magic: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf", ext: "pdf" }],
};

function detectMimeType(bytes: Uint8Array): string | null {
  for (const [, signatures] of Object.entries(ALLOWED_TYPES)) {
    for (const sig of signatures) {
      if (sig.magic.length <= bytes.length && sig.magic.every((b, i) => bytes[i] === b)) {
        return sig.mime;
      }
    }
  }
  return null;
}

function safeExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  // Only allow known safe extensions
  const safe = ["jpg", "jpeg", "png", "gif", "webp", "pdf"];
  return safe.includes(ext) ? ext : "bin";
}

export interface AttachmentInfo {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  transactionId: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: number;
}

export async function uploadAttachment(
  db: D1Database,
  bucket: R2Bucket,
  organizationId: string,
  userId: string,
  entityType: string,
  entityId: string,
  transactionId: string | null,
  fileName: string,
  fileData: Uint8Array,
): Promise<AttachmentInfo> {
  // Size check
  if (fileData.length > MAX_FILE_SIZE) {
    throw badRequest("file_too_large", `File terlalu besar. Maksimal ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }

  // MIME detection via magic bytes
  const mimeType = detectMimeType(fileData);
  if (!mimeType) {
    throw badRequest("invalid_file_type", "Tipe file tidak didukung. Gunakan PDF, JPEG, PNG, GIF, atau WebP");
  }

  // Validate entity type
  if (!["transaction", "party", "product"].includes(entityType)) {
    throw badRequest("invalid_entity", "Entity type harus transaction, party, atau product");
  }

  const id = generateId();
  const now = Date.now();
  const ext = safeExtension(fileName);
  const storageKey = `attachments/${organizationId}/${id}.${ext}`;

  // Upload to R2
  await bucket.put(storageKey, fileData, {
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      originalName: fileName,
      uploadedBy: userId,
      organizationId,
    },
  });

  // Insert DB record
  await execute(
    db,
    `INSERT INTO attachments (id, organization_id, transaction_id, entity_type, entity_id, file_name, file_size, mime_type, storage_key, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, organizationId, transactionId, entityType, entityId, fileName, fileData.length, mimeType, storageKey, userId, now],
  );

  // Audit log
  await execute(
    db,
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, after_json, created_at)
     VALUES (?, ?, ?, 'attachment', ?, 'uploaded', ?, ?)`,
    [generateId(), organizationId, userId, id, JSON.stringify({ fileName, fileSize: fileData.length, mimeType }), now],
  );

  return {
    id, organizationId, entityType, entityId, transactionId,
    fileName, fileSize: fileData.length, mimeType, uploadedBy: userId, createdAt: now,
  };
}

export async function getAttachment(
  db: D1Database,
  bucket: R2Bucket,
  organizationId: string,
  attachmentId: string,
): Promise<{ info: AttachmentInfo; stream: ReadableStream }> {
  const row = await queryFirst<AttachmentRow>(
    db,
    `SELECT * FROM attachments WHERE id = ? AND organization_id = ?`,
    [attachmentId, organizationId],
  );
  if (!row) throw notFound("attachment_not_found", "Lampiran tidak ditemukan");

  const obj = await bucket.get(row.storage_key);
  if (!obj) throw notFound("file_not_found", "File tidak ditemukan di penyimpanan");

  return {
    info: {
      id: row.id, organizationId: row.organization_id,
      entityType: row.entity_type, entityId: row.entity_id,
      transactionId: row.transaction_id,
      fileName: row.file_name, fileSize: row.file_size,
      mimeType: row.mime_type, uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    },
    stream: obj.body,
  };
}

export async function deleteAttachment(
  db: D1Database,
  bucket: R2Bucket,
  organizationId: string,
  userId: string,
  attachmentId: string,
): Promise<void> {
  const row = await queryFirst<AttachmentRow>(
    db,
    `SELECT * FROM attachments WHERE id = ? AND organization_id = ?`,
    [attachmentId, organizationId],
  );
  if (!row) throw notFound("attachment_not_found", "Lampiran tidak ditemukan");

  // Delete from R2
  await bucket.delete(row.storage_key);

  // Delete DB record
  await execute(db, `DELETE FROM attachments WHERE id = ?`, [attachmentId]);

  // Audit log
  await execute(
    db,
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, after_json, created_at)
     VALUES (?, ?, ?, 'attachment', ?, 'deleted', ?, ?)`,
    [generateId(), organizationId, userId, attachmentId, JSON.stringify({ fileName: row.file_name }), Date.now()],
  );
}

export async function listAttachments(
  db: D1Database,
  organizationId: string,
  entityType: string,
  entityId: string,
): Promise<AttachmentInfo[]> {
  const rows = await queryAll<AttachmentRow>(
    db,
    `SELECT * FROM attachments WHERE organization_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
    [organizationId, entityType, entityId],
  );
  return rows.map((r) => ({
    id: r.id, organizationId: r.organization_id,
    entityType: r.entity_type, entityId: r.entity_id,
    transactionId: r.transaction_id,
    fileName: r.file_name, fileSize: r.file_size,
    mimeType: r.mime_type, uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  }));
}

interface AttachmentRow {
  id: string;
  organization_id: string;
  transaction_id: string | null;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_key: string;
  uploaded_by: string;
  created_at: number;
}

const MS_PER_DAY = 86400000;
const DEFAULT_ATTACHMENT_RETENTION_DAYS = 365; // 1 year

export interface AttachmentCleanupResult {
  /** Attachments deleted because the parent entity no longer exists */
  orphaned: number;
  /** Attachments deleted because they exceeded the retention period */
  expired: number;
  /** R2 objects deleted that had no corresponding DB record */
  r2Orphans: number;
  /** Any errors encountered during cleanup */
  errors: string[];
}

/** Attempt to delete an R2 object, silently ignoring if already gone. */
async function safeDeleteR2(bucket: R2Bucket, storageKey: string): Promise<void> {
  try {
    await bucket.delete(storageKey);
  } catch {
    // R2 file may already be gone
  }
}

/** Check whether the parent entity (transaction, party, or product) still exists. */
async function parentEntityExists(
  db: D1Database,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  switch (entityType) {
    case "transaction": {
      const row = await queryFirst<{ id: string }>(db, `SELECT id FROM transactions WHERE id = ?`, [entityId]);
      return !!row;
    }
    case "party": {
      const row = await queryFirst<{ id: string }>(db, `SELECT id FROM parties WHERE id = ?`, [entityId]);
      return !!row;
    }
    case "product": {
      const row = await queryFirst<{ id: string }>(db, `SELECT id FROM products WHERE id = ?`, [entityId]);
      return !!row;
    }
    default:
      return false; // Unknown entity type — treat as orphan
  }
}

/** Process a single attachment: delete if orphaned or expired. Returns 'orphaned', 'expired', or 'kept'. */
async function processSingleAttachment(
  db: D1Database,
  bucket: R2Bucket,
  att: AttachmentRow,
  cutoff: number,
): Promise<"orphaned" | "expired" | "kept"> {
  const parentExists = await parentEntityExists(db, att.entity_type, att.entity_id);

  if (!parentExists) {
    await safeDeleteR2(bucket, att.storage_key);
    await execute(db, `DELETE FROM attachments WHERE id = ?`, [att.id]);
    return "orphaned";
  }

  if (att.created_at < cutoff) {
    await safeDeleteR2(bucket, att.storage_key);
    await execute(db, `DELETE FROM attachments WHERE id = ?`, [att.id]);
    return "expired";
  }

  return "kept";
}

/** List R2 objects under `attachments/` and delete any that have no matching DB record. */
async function cleanupR2OrphanFiles(
  bucket: R2Bucket,
  storageKeys: Set<string>,
  errors: string[],
): Promise<number> {
  let deleted = 0;
  try {
    let cursor: string | undefined;
    do {
      const listed = await bucket.list({ prefix: "attachments/", cursor, limit: 1000 });
      for (const obj of listed.objects) {
        if (storageKeys.has(obj.key)) continue;
        try {
          await bucket.delete(obj.key);
          deleted++;
        } catch {
          // Skip if delete fails
        }
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  } catch (e) {
    errors.push(`Error listing R2 objects: ${e instanceof Error ? e.message : String(e)}`);
  }
  return deleted;
}

/**
 * Clean up orphaned and expired attachments.
 *
 * 1. Deletes attachment DB records + R2 files where the parent entity
 *    (transaction, party, product) no longer exists.
 * 2. Deletes attachment records + R2 files older than `retentionDays`.
 * 3. Lists R2 objects under the `attachments/` prefix and removes any
 *    that don't have a matching DB record.
 */
export async function cleanupOrphanedAttachments(
  db: D1Database,
  bucket: R2Bucket,
  retentionDays = DEFAULT_ATTACHMENT_RETENTION_DAYS,
): Promise<AttachmentCleanupResult> {
  const result: AttachmentCleanupResult = {
    orphaned: 0,
    expired: 0,
    r2Orphans: 0,
    errors: [],
  };
  const cutoff = Date.now() - retentionDays * MS_PER_DAY;

  try {
    const attachments = await queryAll<AttachmentRow>(db, `SELECT * FROM attachments`);

    for (const att of attachments) {
      try {
        const action = await processSingleAttachment(db, bucket, att, cutoff);
        if (action === "orphaned") result.orphaned++;
        else if (action === "expired") result.expired++;
      } catch (e) {
        result.errors.push(`Error processing attachment ${att.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const storageKeys = new Set(attachments.map((a) => a.storage_key));
    result.r2Orphans = await cleanupR2OrphanFiles(bucket, storageKeys, result.errors);
  } catch (e) {
    result.errors.push(`Error querying attachments: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}
