import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { createAdmin, listAdmins, setAdminStatus } from "../services/admin-auth.service";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(320),
  password: z.string().min(8).max(72).regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar").regex(/\d/, "Password harus mengandung minimal 1 angka"),
  fullName: z.string().min(2).max(160),
});

const statusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export const adminsRoutes = new Hono<AppContext>();

adminsRoutes.get("/", async (c) => {
  const admins = await listAdmins(c.env.DB);
  return c.json({ admins });
});

adminsRoutes.post("/", async (c) => {
  const body = await readJson(c, createSchema);
  const session = c.get("adminSession");
  const admin = await createAdmin(
    c.env.DB,
    { id: session.admin_user_id, email: session.email },
    body,
    c.env.ADMIN_PASSWORD_PEPPER,
  );
  return c.json({ admin }, 201);
});

adminsRoutes.patch("/:id/status", async (c) => {
  const body = await readJson(c, statusSchema);
  const session = c.get("adminSession");
  await setAdminStatus(
    c.env.DB,
    { id: session.admin_user_id, email: session.email },
    c.req.param("id"),
    body.status,
  );
  return c.json({ ok: true });
});
