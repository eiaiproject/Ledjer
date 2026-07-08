import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppContext } from "../env";

export const SESSION_COOKIE = "ledjer_session";

export function getSessionCookie(c: Context<AppContext>): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(
  c: Context<AppContext>,
  token: string,
  expiresAt: number,
): void {
  setCookie(c, SESSION_COOKIE, token, {
    domain: c.env.COOKIE_DOMAIN,
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: true,
  });
}

export function clearSessionCookie(c: Context<AppContext>): void {
  deleteCookie(c, SESSION_COOKIE, {
    domain: c.env.COOKIE_DOMAIN,
    path: "/",
    secure: true,
  });
}
