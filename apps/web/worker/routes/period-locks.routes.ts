import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../services/organization.service";
import { readJson } from "../http/json";
import {
  createPeriodLock,
  listPeriodLocks,
  deletePeriodLock,
} from "../services/period-locks.service";
import { loadCurrentOrganization } from "../middleware/organization.middleware";

const createPeriodLockSchema = z.object({
  lockedThroughDate: z.string().min(1).max(10),
  reason: z.string().max(500).optional(),
});

const reopenPeriodLockSchema = z.object({
  reason: z.string().min(1, "Alasan pembukaan kembali wajib diisi").max(500),
});

export const periodLocksRoutes = new Hono<AppContext>();

periodLocksRoutes.use("*", requireAuth());
periodLocksRoutes.use("*", loadCurrentOrganization());

periodLocksRoutes.get("/", async (c) => {
  const { organization } = c.get("organizationContext");
  const locks = await listPeriodLocks(c.env.DB, organization.id);
  return c.json({ periodLocks: locks });
});

periodLocksRoutes.post("/", async (c) => {
  const { member } = c.get("organizationContext");
  requirePermission(member, "organization:update");

  const session = c.get("session");
  const body = await readJson(c, createPeriodLockSchema);
  const lock = await createPeriodLock(
    c.env.DB,
    member.organization_id,
    session.user_id,
    body,
  );
  return c.json({ periodLock: lock }, 201);
});

periodLocksRoutes.delete("/:lockId", async (c) => {
  const { member } = c.get("organizationContext");
  requirePermission(member, "organization:update");

  const session = c.get("session");
  const body = await readJson(c, reopenPeriodLockSchema);

  await deletePeriodLock(
    c.env.DB,
    member.organization_id,
    c.req.param("lockId"),
    session.user_id,
    body.reason,
  );
  return c.json({ success: true });
});
