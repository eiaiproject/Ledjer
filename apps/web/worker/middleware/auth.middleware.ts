import type { Context, MiddlewareHandler } from "hono";
import { clearSessionCookie, getSessionCookie } from "../auth/cookies";
import type { AppContext } from "../env";
import { unauthorized } from "../http/errors";
import {
  getSessionByToken,
  sessionUser,
  type CurrentSessionRow,
  type SessionUser,
} from "../services/session.service";

export function requireAuth(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const session = await getAuthenticatedSession(c);
    c.set("session", session);
    c.set("user", sessionUser(session));
    await next();
  };
}

export async function getAuthenticatedSession(
  c: Context<AppContext>,
): Promise<CurrentSessionRow> {
  const token = getSessionCookie(c);
  if (!token) throw unauthorized();

  const session = await getSessionByToken(c.env.DB, token);
  if (!session) {
    clearSessionCookie(c);
    throw unauthorized();
  }

  return session;
}

export function currentSession(c: Context<AppContext>): CurrentSessionRow {
  return c.get("session");
}

export function currentUser(c: Context<AppContext>): SessionUser {
  return c.get("user");
}
