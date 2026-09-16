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

/**
 * Nama cookie sesi yang perlu dihapus (logout / sesi tidak valid).
 *
 * Varian `__Host-` hanya boleh dikirim saat produksi: prefix itu mewajibkan
 * atribut Secure, dan mengirimnya lewat http (dev) melempar error sehingga
 * request gagal 500. Produksi tetap menghapus keduanya agar cookie dev yang
 * tersisa dari sebelum rename ikut bersih.
 */
export function sessionCookieNames(isProduction: boolean): readonly string[] {
  return isProduction
    ? (["__Host-ledjer_session", "ledjer_session"] as const)
    : (["ledjer_session"] as const);
}
