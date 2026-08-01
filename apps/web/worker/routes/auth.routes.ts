import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../env";

function cookieName(c: Context): string {
  return c.env.APP_ENV === "production" ? "__Host-ledjer_session" : "ledjer_session";
}

function cookieOptions(c: Context) {
  const isHostPrefix = c.env.APP_ENV === "production";
  const secure = isHostPrefix ? true : isSecureRequest(c);
  return {
    domain: isHostPrefix ? undefined : c.env.COOKIE_DOMAIN,
    path: "/",
    sameSite: "Lax" as const,
    // __Host- prefix requires Secure flag unconditionally.
    // In production the app always serves over HTTPS (Cloudflare).
    secure,
    httpOnly: true,
    partitioned: secure ? true : undefined,
  };
}
import { tooManyRequests, unauthorized } from "../http/errors";
import { execute } from "../db/client";
import { readJson } from "../http/json";
import {
  changePassword,
  createPasswordReset,
  deleteAccount,
  loginUser,
  registerUser,
  resendEmailVerification,
  resetPassword,
  verifyEmailToken,
  verifyPasswordResetToken,
} from "../services/auth.service";
import {
  buildGoogleAuthUrl,
  completeGoogleAuth,
} from "../services/google-auth.service";
import { checkRateLimit } from "../services/rate-limit.service";
import {
  getSessionByToken,
} from "../services/session.service";
import { logAuthEvent } from "../services/auth-audit.service";

// RFC 2606 reserved example domains — blocked to prevent email send errors
const BLOCKED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "example.edu"]);

const emailSchema = z.string().email()
  .refine((val) => {
    const domain = val.split("@")[1];
    return domain ? !BLOCKED_EMAIL_DOMAINS.has(domain.toLowerCase()) : true;
  }, "Email domain tidak diizinkan")
  .transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8).max(72).regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar").regex(/\d/, "Password harus mengandung minimal 1 angka");

function isSecureRequest(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(2).max(160),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

const verifyEmailSchema = z.object({
  token: z.string().min(16),
  type: z.enum(["signup", "recovery"]).default("signup"),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  password: passwordSchema,
});

const deleteAccountSchema = z.object({
  password: z.string().max(256).optional(),
  confirmation: z.string().max(32).optional(),
});

export const authRoutes = new Hono<AppContext>();

function emailOriginUrl(c: Context): string {
  return (c.env.APP_ORIGIN || new URL(c.req.url).origin).split(",")[0].trim();
}

function emailFromAddress(c: Context): string | undefined {
  return c.env.EMAIL_FROM || undefined;
}

authRoutes.post("/register", async (c) => {
  const body = await readJson(c, registerSchema);
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await checkRateLimit(c.env.DB, "register", ip, { max: 5, windowMs: 3600000 })) {
    throw tooManyRequests("Too many registration attempts. Please try again later.");
  }
  const result = await registerUser(c.env.DB, body, c.env.PASSWORD_PEPPER, c.env.EMAIL_API_KEY, emailOriginUrl(c), emailFromAddress(c));

  return c.json({
    user: { id: result.userId, email: body.email, fullName: body.fullName },
    session: null,
    needsEmailConfirmation: result.needsEmailConfirmation,
  });
});

authRoutes.post("/login", async (c) => {
  const body = await readJson(c, loginSchema);
  const session = await loginUser(
    c.env.DB,
    body.email,
    body.password,
    c.req.raw,
    c.env.PASSWORD_PEPPER,
  );

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
      // Revoke by session_id since getSessionByToken may have rotated the token
      await execute(c.env.DB, "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [Date.now(), row.session_id]);
      logAuthEvent(c.env.DB, row.user_id, row.user_id, "logout", {});
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

  // Set new cookie if token was rotated
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
      email_verified_at: row.email_verified_at,
      has_oauth: row.has_oauth === 1,
    },
    session: {
      id: row.session_id,
      user_id: row.user_id,
      expires_at: row.expires_at,
      current_organization_id: row.current_organization_id,
    },
  });
});

authRoutes.post("/verify-email", async (c) => {
  const body = await readJson(c, verifyEmailSchema);
  const session = body.type === "recovery"
    ? await verifyPasswordResetToken(c.env.DB, body.token, c.req.raw)
    : await verifyEmailToken(c.env.DB, body.token, c.req.raw);
  setCookie(c, cookieName(c), session.token, {
    ...cookieOptions(c),
    expires: new Date(session.expiresAt),
    httpOnly: true,
  });
  return c.json({ ok: true });
});

authRoutes.post("/resend-verification", async (c) => {
  const body = await readJson(c, z.object({ email: emailSchema }));
  // Always return 200 to avoid email enumeration. Rate limit the actual send.
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const emailKey = body.email.toLowerCase();
  if (!await checkRateLimit(c.env.DB, "email_verify", emailKey, { max: 3, windowMs: 3600000 })
      && !await checkRateLimit(c.env.DB, "email_verify", ip, { max: 10, windowMs: 3600000 })) {
    await resendEmailVerification(c.env.DB, body.email, c.env.EMAIL_API_KEY, emailOriginUrl(c), emailFromAddress(c));
  }
  return c.json({ ok: true });
});

authRoutes.post("/forgot-password", async (c) => {
  const body = await readJson(c, forgotPasswordSchema);
  // Always return 200 to avoid email enumeration. Rate limit the actual send.
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const emailKey = body.email.toLowerCase();
  if (!await checkRateLimit(c.env.DB, "password_reset", emailKey, { max: 3, windowMs: 3600000 })
      && !await checkRateLimit(c.env.DB, "password_reset", ip, { max: 10, windowMs: 3600000 })) {
    await createPasswordReset(c.env.DB, body.email, c.env.EMAIL_API_KEY, emailOriginUrl(c), emailFromAddress(c));
  }
  return c.json({ ok: true });
});

authRoutes.post("/reset-password", async (c) => {
  const body = await readJson(c, resetPasswordSchema);
  const row = await requireSession(c);
  await resetPassword(c.env.DB, row.user_id, body.password, c.env.PASSWORD_PEPPER);
  deleteCookie(c, cookieName(c), cookieOptions(c));
  return c.json({ ok: true });
});

authRoutes.post("/change-password", async (c) => {
  const body = await readJson(c, changePasswordSchema);
  const row = await requireSession(c);
  await changePassword(
    c.env.DB,
    row.user_id,
    body.currentPassword,
    body.password,
    c.env.PASSWORD_PEPPER,
  );
  deleteCookie(c, cookieName(c), cookieOptions(c));
  return c.json({ ok: true });
});

authRoutes.post("/delete-account", async (c) => {
  const body = await readJson(c, deleteAccountSchema);
  const row = await requireSession(c);
  const result = await deleteAccount(c.env.DB, row.user_id, body, c.env.PASSWORD_PEPPER);
  deleteCookie(c, cookieName(c), cookieOptions(c));
  return c.json({ ok: true, deletedOrganizations: result.deletedOrganizations });
});

authRoutes.get("/google/start", (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.json(
      {
        error: {
          code: "oauth_not_configured",
          message: "Google OAuth is not configured yet",
          requestId: c.get("requestId"),
        },
      },
      501,
    );
  }

  // Generate CSRF state token
  const state = crypto.randomUUID();
  const current = Date.now();

  // Store state in cookie (5 min expiry)
  setCookie(c, "google_oauth_state", state, {
    ...cookieOptions(c),
    expires: new Date(current + 5 * 60 * 1000),
    httpOnly: true,
  });

  // Build redirect URI (worker callback endpoint).
  // ponytail: use only the first origin from comma-separated APP_ORIGIN list;
  // OAuth provider only accepts a single redirect_uri.
  const firstOrigin = (c.env.APP_ORIGIN || new URL(c.req.url).origin).split(",")[0].trim();
  const redirectUri = `${firstOrigin}/api/auth/google/callback`;

  const url = buildGoogleAuthUrl(clientId, redirectUri, state);
  return c.json({ url });
});

authRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`/auth/callback?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect("/auth/callback?error=missing_params");
  }

  // Verify CSRF state
  const storedState = getCookie(c, "google_oauth_state");
  if (!storedState || storedState !== state) {
    return c.redirect("/auth/callback?error=invalid_state");
  }

  // Clear state cookie
  deleteCookie(c, "google_oauth_state", cookieOptions(c));

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.redirect("/auth/callback?error=oauth_not_configured");
  }

  try {
    // ponytail: use only the first origin — same as /google/start.
    const origin = (c.env.APP_ORIGIN || new URL(c.req.url).origin).split(",")[0].trim();
    const redirectUri = `${origin}/api/auth/google/callback`;

    const session = await completeGoogleAuth(
      c.env.DB,
      code,
      clientId,
      clientSecret,
      redirectUri,
      c.req.raw,
    );

    setCookie(c, cookieName(c), session.token, {
      ...cookieOptions(c),
      expires: new Date(session.expiresAt),
      httpOnly: true,
    });
    return c.redirect("/auth/callback?success=true");
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.redirect(`/auth/callback?error=${encodeURIComponent(message)}`);
  }
});

async function requireSession(c: Context<AppContext>) {
  const token = getCookie(c, cookieName(c));
  if (!token) throw unauthorized();

  const row = await getSessionByToken(c.env.DB, token);
  if (!row) {
    deleteCookie(c, cookieName(c), cookieOptions(c));
    throw unauthorized();
  }

  // Set new cookie if token was rotated
  if ("newToken" in row && row.newToken) {
    setCookie(c, cookieName(c), row.newToken, {
      ...cookieOptions(c),
      expires: new Date(row.expires_at),
    });
  }

  return row;
}
