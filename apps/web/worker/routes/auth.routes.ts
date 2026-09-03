import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../env";
import { tooManyRequests, unauthorized } from "../http/errors";
import { execute } from "../db/client";
import { readJson } from "../http/json";
import { loginUser, registerUser } from "../services/auth.service";
import { checkRateLimit } from "../services/rate-limit.service";
import { getSessionByToken } from "../services/session.service";
import { logAuthEvent } from "../services/auth-audit.service";

// RFC 2606 reserved example domains - blocked to prevent email send errors
const BLOCKED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "example.edu"]);

const emailSchema = z.email()
  .refine((val) => {
    const domain = val.split("@")[1];
    return domain ? !BLOCKED_EMAIL_DOMAINS.has(domain.toLowerCase()) : true;
  }, "Email domain tidak diizinkan")
  .transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8).max(72).regex(/[A-Za-z]/, "Password harus mengandung huruf").regex(/\d/, "Password harus mengandung angka");

function cookieName(c: Context): string {
  return c.env.APP_ENV === "production" ? "__Host-ledjer_session" : "ledjer_session";
}

function cookieOptions(c: Context) {
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

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(2).max(160),
  organizationName: z.string().min(1).max(120),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const authRoutes = new Hono<AppContext>();

authRoutes.post("/register", async (c) => {
  const body = await readJson(c, registerSchema);
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await checkRateLimit(c.env.DB, "register", ip, { max: 5, windowMs: 15 * 60 * 1000 })) {
    throw tooManyRequests("Terlalu banyak percobaan pendaftaran. Coba lagi nanti.");
  }

  const result = await registerUser(c.env.DB, body, c.req.raw, c.env.PASSWORD_PEPPER);
  setCookie(c, cookieName(c), result.session.token, {
    ...cookieOptions(c),
    expires: new Date(result.session.expiresAt),
    httpOnly: true,
  });

  return c.json({
    user: { id: result.userId, email: body.email, fullName: body.fullName },
    organization: result.organization,
  });
});

authRoutes.post("/login", async (c) => {
  const body = await readJson(c, loginSchema);
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await checkRateLimit(c.env.DB, "login", `${ip}:${body.email}`, { max: 10, windowMs: 15 * 60 * 1000 })) {
    throw tooManyRequests("Terlalu banyak percobaan. Coba lagi dalam beberapa menit.");
  }

  const session = await loginUser(c.env.DB, body.email, body.password, c.req.raw, c.env.PASSWORD_PEPPER);
  setCookie(c, cookieName(c), session.token, {
    ...cookieOptions(c),
    expires: new Date(session.expiresAt),
    httpOnly: true,
  });
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, cookieName(c));
  if (token) {
    const row = await getSessionByToken(c.env.DB, token);
    if (row) {
      await execute(c.env.DB, "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [Date.now(), row.session_id]);
      await logAuthEvent(c.env.DB, row.user_id, row.user_id, "logout", {});
    }
  }
  deleteCookie(c, cookieName(c), cookieOptions(c));
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const token = getCookie(c, cookieName(c));
  if (!token) return c.json({ user: null, session: null });

  const row = await getSessionByToken(c.env.DB, token);
  if (!row) {
    deleteCookie(c, cookieName(c), cookieOptions(c));
    return c.json({ user: null, session: null });
  }

  if ("newToken" in row && row.newToken) {
    setCookie(c, cookieName(c), row.newToken, {
      ...cookieOptions(c),
      expires: new Date(row.expires_at),
    });
  }

  return c.json({
    user: {
      id: row.user_id,
      email: row.email,
      full_name: row.full_name,
    },
    session: {
      id: row.session_id,
      user_id: row.user_id,
      expires_at: row.expires_at,
      current_organization_id: row.current_organization_id,
    },
  });
});

export { cookieName, cookieOptions };

export async function requireSession(c: Context<AppContext>) {
  const token = getCookie(c, cookieName(c));
  if (!token) throw unauthorized();

  const row = await getSessionByToken(c.env.DB, token);
  if (!row) {
    deleteCookie(c, cookieName(c), cookieOptions(c));
    throw unauthorized();
  }

  if ("newToken" in row && row.newToken) {
    setCookie(c, cookieName(c), row.newToken, {
      ...cookieOptions(c),
      expires: new Date(row.expires_at),
    });
  }

  return row;
}