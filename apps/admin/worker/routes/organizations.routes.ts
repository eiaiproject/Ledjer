import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import {
  getOrganizationDetail,
  listOrganizations,
  setOrganizationStatus,
} from "../services/admin-organizations.service";

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const statusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export const organizationsRoutes = new Hono<AppContext>();

organizationsRoutes.get("/", async (c) => {
  const query = listQuerySchema.parse(c.req.query());
  const result = await listOrganizations(c.env.DB, query);
  return c.json(result);
});

organizationsRoutes.get("/:id", async (c) => {
  const organization = await getOrganizationDetail(c.env.DB, c.req.param("id"));
  return c.json({ organization });
});

organizationsRoutes.patch("/:id/status", async (c) => {
  const body = await readJson(c, statusSchema);
  const session = c.get("adminSession");
  await setOrganizationStatus(
    c.env.DB,
    { id: session.admin_user_id, email: session.email },
    c.req.param("id"),
    body.status,
  );
  return c.json({ ok: true });
});
