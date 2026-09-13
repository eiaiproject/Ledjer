import type { Context } from "hono";

/** Single source of truth untuk nama + atribut cookie sesi (#7). */
export function cookieName(c: Context): string {
  return c.env.APP_ENV === "production" ? "__Host-ledjer_session" : "ledjer_session";
}

export function cookieOptions(c: Context) {
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

/** Hapus kedua varian cookie dengan atribut yang sama seperti saat set. */
export function sessionCookieNames(): readonly string[] {
  return ["__Host-ledjer_session", "ledjer_session"] as const;
}
