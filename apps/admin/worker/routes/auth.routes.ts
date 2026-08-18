import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { changeAdminPassword, loginAdmin } from "../services/admin-auth.service";
import { getAdminSessionByToken, revokeAdminSession } from "../services/admin-session.service";
import { logAdminEvent } from "../services/admin-audit.service";

function cookieName(c: Context): string {
  return c.env.APP_ENV === "production" ? "__Host-ledjer-admin_session" : "ledjer_admin_session";
}

function cookieOptions(c: Context) {
  const isHostPrefix = c.env.APP_ENV === "production";
  const secure = isHostPrefix ? true : new URL(c.req.url).protocol === "https:";
  return {
    path: "/",
    sameSite: "Lax" as const,
    secure,
    httpOnly: true,
    partitioned: secure ? true : undefined,
  };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(320),
  password: z.string().min(1).max(256),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  password: z.string().min(8).max(72).regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar").regex(/\d/, "Password harus mengandung minimal 1 angka"),
});

export const authRoutes = new Hono<AppContext>();

authRoutes.post("/login", async (c) => {
  const body = await readJson(c, loginSchema);
  const session = await loginAdmin(c.env.DB, body, c.req.raw, c.env.ADMIN_PASSWORD_PEPPER);

  setCookie(c, cookieName(c), session.token, {
    ...cookieOptions(c),
    expires: new Date(session.expiresAt),
  });
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, "__Host-ledjer-admin_session") ?? getCookie(c, "ledjer_admin_session");
  if (token) {
    const session = await getAdminSessionByToken(c.env.DB, token);
    if (session) {
      await revokeAdminSession(c.env.DB, token);
      await logAdminEvent(c.env.DB, {
        actorAdminId: session.admin_user_id,
        actorEmail: session.email,
        entityType: "admin",
        entityId: session.admin_user_id,
        action: "admin_logout",
      });
    }
  }
  deleteCookie(c, cookieName(c), cookieOptions(c));
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const token = getCookie(c, "__Host-ledjer-admin_session") ?? getCookie(c, "ledjer_admin_session");
  if (!token) return c.json({ admin: null });

  const session = await getAdminSessionByToken(c.env.DB, token);
  if (!session) {
    deleteCookie(c, cookieName(c), cookieOptions(c));
    return c.json({ admin: null });
  }

  // Set new cookie if token was rotated
  if ("newToken" in session && session.newToken) {
    setCookie(c, cookieName(c), session.newToken, {
      ...cookieOptions(c),
      expires: new Date(session.expires_at),
    });
  }

  return c.json({
    admin: {
      id: session.admin_user_id,
      email: session.email,
      full_name: session.full_name,
    },
  });
});

authRoutes.post("/change-password", async (c) => {
  const body = await readJson(c, changePasswordSchema);
  const session = c.get("adminSession");
  await changeAdminPassword(
    c.env.DB,
    session.admin_user_id,
    body.currentPassword,
    body.password,
    c.env.ADMIN_PASSWORD_PEPPER,
  );
  deleteCookie(c, cookieName(c), cookieOptions(c));
  return c.json({ ok: true });
});

export { cookieName, cookieOptions };
