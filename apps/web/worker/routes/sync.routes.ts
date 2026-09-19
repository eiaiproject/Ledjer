import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { queryFirst } from "../db/client";
import { requireSession } from "./auth.routes";
import { createUserSnapshot, pullSyncOps, pushSyncOp } from "../services/sync.service";
import { readJson } from "../http/json";

export const syncRoutes = new Hono<AppContext>();

// HLC generator server-side bila client tidak kirim: wallClock-counter
function generateHlc(): string {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

const pushSchema = z.object({
  op_id: z.string().optional(),
  opId: z.string().optional(),
  entity_type: z.string().optional(),
  entityType: z.string().optional(),
  entity_id: z.string().optional(),
  entityId: z.string().optional(),
  op_type: z.enum(["create", "update", "delete"]).optional(),
  opType: z.string().optional(),
  payload: z.unknown().optional(),
  hlc: z.string().optional(),
  created_at: z.number().optional(),
  createdAt: z.number().optional(),
});

/**
 * POST /api/sync/push — batch push (opsional, untuk batch outbox)
 * Body: { ops: [{ op_id, entity_type, entity_id, op_type, payload, hlc }] }
 */
syncRoutes.post("/push", async (c) => {
  const session = await requireSession(c);
  const body = await readJson(c, z.object({ ops: z.array(pushSchema) }).passthrough());
  const ops = (body as { ops: z.infer<typeof pushSchema>[] }).ops ?? [];
  const results: Array<{ op_id: string; stored: boolean }> = [];
  for (const op of ops) {
    const opId = (op.op_id ?? op.opId ?? crypto.randomUUID()) as string;
    const entityType = (op.entity_type ?? op.entityType ?? "unknown") as string;
    const entityId = (op.entity_id ?? op.entityId ?? opId) as string;
    const opType = ((op.op_type ?? op.opType ?? "create") as string).toLowerCase() as "create" | "update" | "delete";
    const hlc = (op.hlc as string) ?? generateHlc();
    const payloadStr = typeof op.payload === "string" ? (op.payload as string) : JSON.stringify(op.payload ?? {});
    const res = await pushSyncOp(c.env.DB, {
      op_id: opId,
      user_id: session.user_id,
      device_id: null,
      entity_type: entityType,
      entity_id: entityId,
      op_type: ["create", "update", "delete"].includes(opType) ? opType : "create",
      payload: payloadStr,
      hlc,
      created_at: (op.created_at as number) ?? (op.createdAt as number) ?? Date.now(),
    });
    results.push({ op_id: opId, stored: res.stored });
  }
  return c.json({ ok: true, results });
});

/**
 * GET /api/sync/pull?since=hlc&limit=100 — tarik ops untuk device lain / restore
 */
syncRoutes.get("/pull", async (c) => {
  const session = await requireSession(c);
  const since = c.req.query("since");
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const ops = await pullSyncOps(c.env.DB, session.user_id, since, limit);
  return c.json({ ops, count: ops.length });
});

/**
 * GET /api/sync/snapshot — full snapshot untuk restore device baru (login Google → tarik snapshot)
 */
syncRoutes.get("/snapshot", async (c) => {
  const session = await requireSession(c);
  const ops = await pullSyncOps(c.env.DB, session.user_id, undefined, 10000);
  // Juga include data user untuk verifikasi
  const user = await queryFirst<{ id: string; email: string; full_name: string; business_name: string }>(
    c.env.DB,
    "SELECT id, email, full_name, business_name FROM users WHERE id = ?",
    [session.user_id],
  );
  return c.json({ user, ops, count: ops.length, hlc: ops.at(-1)?.hlc ?? null });
});

/**
 * POST /api/sync/snapshot — buat snapshot R2 per-user (backup tipis)
 */
syncRoutes.post("/snapshot", async (c) => {
  const session = await requireSession(c);
  if (!c.env.BACKUP_BUCKET) {
    return c.json({ error: { code: "backup_not_configured", message: "R2 bucket tidak dikonfigurasi" } }, 501);
  }
  const result = await createUserSnapshot(c.env.DB, c.env.BACKUP_BUCKET, session.user_id);
  return c.json({ ok: true, ...result });
});

/**
 * GET /api/sync/devices — list perangkat terdaftar (untuk debug)
 */
syncRoutes.get("/devices", async (c) => {
  const session = await requireSession(c);
  const rows = await c.env.DB.prepare("SELECT id, device_name, created_at, last_seen FROM sync_devices WHERE user_id = ? ORDER BY last_seen DESC")
    .bind(session.user_id)
    .all();
  return c.json({ devices: rows.results });
});

/**
 * POST /api/sync/:entity/:id — terima single op dari outbox lokal (create/update/delete)
 * Body: JSON payload entity. Query: op_id/hlc optional.
 * Dedup by op_id, LWW by HLC untuk mutable.
 */
syncRoutes.all("/:entity/:id", async (c) => {
  const session = await requireSession(c);
  const entity = c.req.param("entity");
  const entityId = c.req.param("id");
  const method = c.req.method;

  let opType: "create" | "update" | "delete";
  if (method === "PATCH" || method === "PUT") {
    opType = "update";
  } else if (method === "DELETE") {
    opType = "delete";
  } else {
    opType = "create";
  }

  let body: unknown;
  let rawOpId: string | undefined;
  let rawHlc: string | undefined;

  try {
    const json = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    rawOpId = (json.op_id as string) ?? (json.opId as string) ?? (c.req.query("op_id") as string);
    rawHlc = (json.hlc as string) ?? (c.req.query("hlc") as string);
    if (json.payload && typeof json.payload === "object") {
      body = json.payload;
    } else if (json.op_id || json.opId) {
      body = json.payload ?? {};
    } else {
      body = json;
    }
  } catch {
    body = {};
  }

  const opId = rawOpId ?? crypto.randomUUID();
  const hlc = rawHlc ?? generateHlc();
  const payloadStr = typeof body === "string" ? (body as string) : JSON.stringify(body ?? {});

  const result = await pushSyncOp(c.env.DB, {
    op_id: opId,
    user_id: session.user_id,
    device_id: (c.req.header("X-Device-Id") as string) ?? null,
    entity_type: entity,
    entity_id: entityId,
    op_type: opType,
    payload: payloadStr,
    hlc,
    created_at: Date.now(),
  });

  if (!result.stored && result.reason === "duplicate_op_id") {
    return c.json({ ok: true, deduplicated: true, op_id: opId }, 200);
  }
  if (!result.stored && result.reason === "stale_hlc") {
    return c.json({ ok: true, stale: true, op_id: opId }, 200);
  }

  return c.json({ ok: true, op_id: opId, hlc }, 201);
});
