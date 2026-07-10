import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import type { AppContext } from "../env";
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
      email_verified_at: session.email_verified_at,
    });
    await next();
  };
}

export async function getAuthenticatedSession(
  c: Context<AppContext>,
): Promise<CurrentSessionRow> {
  const token = getCookie(c, "ledjer_session");
  if (!token) throw unauthorized();

  const session = await getSessionByToken(c.env.DB, token);
  if (!session) {
    deleteCookie(c, "ledjer_session", {
      domain: c.env.COOKIE_DOMAIN,
      path: "/",
      secure: true,
    });
    throw unauthorized();
  }

  return session;
}
