import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../env";
import { unauthorized } from "../http/errors";
import {
  getSessionByToken,
  type CurrentSessionRow,
} from "../services/session.service";

function cookieName(c: Context): string {
  return c.env.APP_ENV === "production" ? "__Host-ledjer_session" : "ledjer_session";
}

function cookieOptions(c: Context<AppContext>) {
  const isHostPrefix = c.env.APP_ENV === "production";
  const secure = isHostPrefix ? true : new URL(c.req.url).protocol === "https:";
  return {
    domain: isHostPrefix ? undefined : c.env.COOKIE_DOMAIN,
    path: "/",
    sameSite: "Lax" as const,
    secure,
    httpOnly: true,
    partitioned: secure ? true : undefined,
  };
}

export function requireAuth(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const session = await getAuthenticatedSession(c);
    c.set("session", session);
    c.set("user", {
      id: session.user_id,
      email: session.email,
      full_name: session.full_name,
    });
    await next();
  };
}

export async function getAuthenticatedSession(
  c: Context<AppContext>,
): Promise<CurrentSessionRow> {
  // Try __Host- prefix first (production), fall back to un-prefixed (dev)
  const token = getCookie(c, "__Host-ledjer_session")
    ?? getCookie(c, "ledjer_session");
  if (!token) throw unauthorized();

  const session = await getSessionByToken(c.env.DB, token);
  if (!session) {
    for (const name of ["__Host-ledjer_session", "ledjer_session"]) {
      deleteCookie(c, name, {
        domain: c.env.APP_ENV === "production" ? undefined : c.env.COOKIE_DOMAIN,
        path: "/",
        secure: true,
      });
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
