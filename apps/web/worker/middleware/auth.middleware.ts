import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../env";
import { cookieName, cookieOptions, sessionCookieNames } from "../http/cookies";
import { unauthorized } from "../http/errors";
import {
  getSessionByToken,
  type CurrentSessionRow,
} from "../services/session.service";

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
    for (const name of sessionCookieNames()) {
      deleteCookie(c, name, cookieOptions(c));
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
