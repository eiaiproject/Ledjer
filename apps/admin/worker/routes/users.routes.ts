import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import {
  deleteUser,
  getUserDetail,
  listUsers,
  sendUserPasswordReset,
  setUserStatus,
} from "../services/admin-users.service";

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const statusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export const usersRoutes = new Hono<AppContext>();

usersRoutes.get("/", async (c) => {
  const query = listQuerySchema.parse(c.req.query());
  const result = await listUsers(c.env.DB, query);
  return c.json(result);
});

usersRoutes.get("/:id", async (c) => {
  const user = await getUserDetail(c.env.DB, c.req.param("id"));
  return c.json({ user });
});

usersRoutes.patch("/:id/status", async (c) => {
  const body = await readJson(c, statusSchema);
  const session = c.get("adminSession");
  await setUserStatus(
    c.env.DB,
    { id: session.admin_user_id, email: session.email },
    c.req.param("id"),
    body.status,
  );
  return c.json({ ok: true });
});

usersRoutes.post("/:id/send-reset", async (c) => {
  const session = c.get("adminSession");
  await sendUserPasswordReset(c.env.DB, { id: session.admin_user_id, email: session.email }, c.req.param("id"), {
    emailApiKey: c.env.EMAIL_API_KEY,
    emailFrom: c.env.EMAIL_FROM,
    userAppOrigin: c.env.USER_APP_ORIGIN,
  });
  return c.json({ ok: true });
});

usersRoutes.delete("/:id", async (c) => {
  const session = c.get("adminSession");
  await deleteUser(c.env.DB, { id: session.admin_user_id, email: session.email }, c.req.param("id"));
  return c.json({ ok: true });
});
