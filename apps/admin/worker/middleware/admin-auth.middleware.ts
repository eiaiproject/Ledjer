import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../env";
import { unauthorized } from "../http/errors";
import {
  getAdminSessionByToken,
  type AdminSessionRow,
} from "../services/admin-session.service";

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

export function requireAdminAuth(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const session = await getAuthenticatedAdminSession(c);
    c.set("adminSession", session);
    await next();
  };
}

export async function getAuthenticatedAdminSession(
  c: Context<AppContext>,
): Promise<AdminSessionRow> {
  const token = getCookie(c, "__Host-ledjer-admin_session")
    ?? getCookie(c, "ledjer_admin_session");
  if (!token) throw unauthorized();

  const session = await getAdminSessionByToken(c.env.DB, token);
  if (!session) {
    for (const name of ["__Host-ledjer-admin_session", "ledjer_admin_session"]) {
      deleteCookie(c, name, { path: "/", secure: true });
    }
    throw unauthorized();
  }

  // Set new cookie if token was rotated
  if ("newToken" in session && session.newToken) {
    setCookie(c, cookieName(c), session.newToken, {
      ...cookieOptions(c),
      expires: new Date(session.expires_at),
    });
  }

  return session;
}
