import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { getSessionCookie, setSessionCookie, clearSessionCookie } from "../auth/cookies";
import type { AppContext } from "../env";
import { badRequest, unauthorized } from "../http/errors";
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
import {
  getSessionByToken,
  publicSession,
  revokeSessionToken,
  sessionUser,
} from "../services/session.service";

const emailSchema = z.string().email().transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8).max(72);

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

  setSessionCookie(c, session.token, session.expiresAt);
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  const token = getSessionCookie(c);
  if (token) {
    await revokeSessionToken(c.env.DB, token);
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const token = getSessionCookie(c);
  if (!token) return c.json({ user: null, session: null });

  const row = await getSessionByToken(c.env.DB, token);
  if (!row) {
    clearSessionCookie(c);
    return c.json({ user: null, session: null });
  }

  return c.json({
    user: sessionUser(row),
    session: publicSession(row),
  });
});

authRoutes.post("/verify-email", async (c) => {
  const body = await readJson(c, verifyEmailSchema);

  if (body.token) {
    const session = body.type === "recovery"
      ? await verifyPasswordResetToken(c.env.DB, body.token, c.req.raw)
      : await verifyEmailToken(c.env.DB, body.token, c.req.raw);
    setSessionCookie(c, session.token, session.expiresAt);
    return c.json({ ok: true });
  }

  if (!body.email) throw badRequest("email_required", "Email is required");
  await resendEmailVerification(c.env.DB, body.email);
  return c.json({ ok: true });
});

authRoutes.post("/forgot-password", async (c) => {
  const body = await readJson(c, forgotPasswordSchema);
  await createPasswordReset(c.env.DB, body.email);
  return c.json({ ok: true });
});

authRoutes.post("/reset-password", async (c) => {
  const body = await readJson(c, resetPasswordSchema);
  const row = await requireSession(c);
  await resetPassword(c.env.DB, row.user_id, body.password, c.env.PASSWORD_PEPPER);
  clearSessionCookie(c);
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
  clearSessionCookie(c);
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
    secure: true,
  });

  // Build redirect URI (worker callback endpoint)
  const origin = c.env.APP_ORIGIN || new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

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
    secure: true,
  });

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.redirect("/auth/callback?error=oauth_not_configured");
  }

  try {
    const origin = c.env.APP_ORIGIN || new URL(c.req.url).origin;
    const redirectUri = `${origin}/api/auth/google/callback`;

    const session = await completeGoogleAuth(
      c.env.DB,
      code,
      clientId,
      clientSecret,
      redirectUri,
      c.req.raw,
    );

    setSessionCookie(c, session.token, session.expiresAt);
    return c.redirect("/auth/callback?success=true");
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.redirect(`/auth/callback?error=${encodeURIComponent(message)}`);
  }
});

async function requireSession(c: Context<AppContext>) {
  const token = getSessionCookie(c);
  if (!token) throw unauthorized();

  const row = await getSessionByToken(c.env.DB, token);
  if (!row) {
    clearSessionCookie(c);
    throw unauthorized();
  }

  return row;
}
