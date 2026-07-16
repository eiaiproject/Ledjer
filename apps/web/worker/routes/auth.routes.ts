import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../env";
import { badRequest, tooManyRequests, unauthorized } from "../http/errors";
import { readJson } from "../http/json";
import {
  changePassword,
  createPasswordReset,
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
  revokeSessionToken,
} from "../services/session.service";

const emailSchema = z.string().email().transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8).max(72);

// ponytail: cookies are Secure only on https origins; localhost http requires Secure=false.
function isSecureRequest(c: Context): boolean {
  const origin = (c.env.APP_ORIGIN || "").split(",")[0].trim() || new URL(c.req.url).origin;
  return origin.startsWith("https://");
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
  email: emailSchema.optional(),
  token: z.string().min(16).optional(),
  type: z.enum(["signup", "recovery"]).default("signup"),
}).refine((value) => value.email || value.token, {
  message: "email or token is required",
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

export const authRoutes = new Hono<AppContext>();

authRoutes.post("/register", async (c) => {
  const body = await readJson(c, registerSchema);
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  if (await checkRateLimit(c.env.DB, "register", ip, { max: 5, windowMs: 3600000 })) {
    throw tooManyRequests("Too many registration attempts. Please try again later.");
  }
  const result = await registerUser(c.env.DB, body, c.env.PASSWORD_PEPPER);

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

  setCookie(c, "ledjer_session", session.token, {
    domain: c.env.COOKIE_DOMAIN,
    expires: new Date(session.expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: isSecureRequest(c),
  });
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, "ledjer_session");
  if (token) {
    await revokeSessionToken(c.env.DB, token);
  }
  deleteCookie(c, "ledjer_session", {
    domain: c.env.COOKIE_DOMAIN,
    path: "/",
    secure: isSecureRequest(c),
  });
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const token = getCookie(c, "ledjer_session");
  if (!token) return c.json({ user: null, session: null });

  const row = await getSessionByToken(c.env.DB, token);
  if (!row) {
    deleteCookie(c, "ledjer_session", {
      domain: c.env.COOKIE_DOMAIN,
      path: "/",
      secure: isSecureRequest(c),
    });
    return c.json({ user: null, session: null });
  }

  return c.json({
    user: {
      id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      email_verified_at: row.email_verified_at,
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

  if (body.token) {
    const session = body.type === "recovery"
      ? await verifyPasswordResetToken(c.env.DB, body.token, c.req.raw)
      : await verifyEmailToken(c.env.DB, body.token, c.req.raw);
    setCookie(c, "ledjer_session", session.token, {
      domain: c.env.COOKIE_DOMAIN,
      expires: new Date(session.expiresAt),
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: isSecureRequest(c),
    });
    return c.json({ ok: true });
  }

  if (!body.email) throw badRequest("email_required", "Email is required");
  // Always return 200 to avoid email enumeration. Rate limit the actual send.
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const emailKey = body.email.toLowerCase();
  if (!await checkRateLimit(c.env.DB, "email_verify", emailKey, { max: 3, windowMs: 3600000 })
      && !await checkRateLimit(c.env.DB, "email_verify", ip, { max: 10, windowMs: 3600000 })) {
    await resendEmailVerification(c.env.DB, body.email);
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
    await createPasswordReset(c.env.DB, body.email);
  }
  return c.json({ ok: true });
});

authRoutes.post("/reset-password", async (c) => {
  const body = await readJson(c, resetPasswordSchema);
  const row = await requireSession(c);
  await resetPassword(c.env.DB, row.user_id, body.password, c.env.PASSWORD_PEPPER);
  deleteCookie(c, "ledjer_session", {
    domain: c.env.COOKIE_DOMAIN,
    path: "/",
    secure: isSecureRequest(c),
  });
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
  deleteCookie(c, "ledjer_session", {
    domain: c.env.COOKIE_DOMAIN,
    path: "/",
    secure: isSecureRequest(c),
  });
  return c.json({ ok: true });
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
    domain: c.env.COOKIE_DOMAIN,
    expires: new Date(current + 5 * 60 * 1000),
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: isSecureRequest(c),
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
  deleteCookie(c, "google_oauth_state", {
    domain: c.env.COOKIE_DOMAIN,
    path: "/",
    secure: isSecureRequest(c),
  });

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

    setCookie(c, "ledjer_session", session.token, {
      domain: c.env.COOKIE_DOMAIN,
      expires: new Date(session.expiresAt),
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: isSecureRequest(c),
    });
    return c.redirect("/auth/callback?success=true");
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.redirect(`/auth/callback?error=${encodeURIComponent(message)}`);
  }
});

async function requireSession(c: Context<AppContext>) {
  const token = getCookie(c, "ledjer_session");
  if (!token) throw unauthorized();

  const row = await getSessionByToken(c.env.DB, token);
  if (!row) {
    deleteCookie(c, "ledjer_session", {
      domain: c.env.COOKIE_DOMAIN,
      path: "/",
      secure: isSecureRequest(c),
    });
    throw unauthorized();
  }

  return row;
}
