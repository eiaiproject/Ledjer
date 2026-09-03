import { execute, queryFirst } from "../db/client";
import { generateId, randomBytes } from "../auth/tokens";
import { bytesToBase64 } from "../auth/encoding";
import { createSession, type CreatedSession } from "./session.service";
import { badRequest, conflict, unauthorized } from "../http/errors";
import { hashPassword } from "../auth/password";
import { logAuthEvent } from "./auth-audit.service";
import { createOrganizationWithOwner } from "./organization.service";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_SCOPES = "openid profile email";

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  status: string;
}

/**
 * Generate the Google OAuth authorization URL.
 * State is stored in a short-lived cookie for CSRF protection.
 */
export function buildGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens and fetch Google user info.
 */
async function exchangeCodeForUser(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GoogleUserInfo> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw badRequest("oauth_token_exchange_failed", `Google token exchange failed: ${error}`);
  }

  const tokens: GoogleTokenResponse = await tokenResponse.json();

  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoResponse.ok) {
    throw badRequest("oauth_userinfo_failed", "Failed to fetch Google user info");
  }

  return userInfoResponse.json();
}

/**
 * Find existing user by Google provider account ID.
 */
async function findUserByGoogleId(
  db: D1Database,
  googleId: string,
): Promise<UserRow | null> {
  return queryFirst<UserRow>(
    db,
    `SELECT u.id, u.email, u.full_name, u.status
     FROM oauth_accounts oa
     JOIN users u ON u.id = oa.user_id
     WHERE oa.provider = 'google'
       AND oa.provider_account_id = ?`,
    [googleId],
  );
}

/**
 * Find existing user by email.
 */
async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRow | null> {
  return queryFirst<UserRow>(
    db,
    `SELECT id, email, full_name, status
     FROM users
     WHERE email = ?`,
    [email],
  );
}

/**
 * Link Google OAuth account to an existing user.
 */
async function linkOAuthAccount(
  db: D1Database,
  userId: string,
  googleId: string,
  googleEmail: string,
): Promise<void> {
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM oauth_accounts
     WHERE provider = 'google'
       AND provider_account_id = ?`,
    [googleId],
  );

  if (existing) return; // Already linked

  const current = Date.now();
  await execute(
    db,
    `INSERT INTO oauth_accounts (
       id, user_id, provider, provider_account_id, email, created_at, updated_at
     ) VALUES (?, ?, 'google', ?, ?, ?, ?)`,
    [generateId(), userId, googleId, googleEmail, current, current],
  );
}

/**
 * Create a new user from Google info (random unguessable password so
 * password login stays impossible for accounts created via OAuth).
 */
async function createUserFromGoogle(
  db: D1Database,
  googleUser: GoogleUserInfo,
): Promise<UserRow> {
  const current = Date.now();
  const userId = generateId();

  const passwordHash = await hashPassword(bytesToBase64(randomBytes(32)));

  await execute(
    db,
    `INSERT INTO users (
       id, email, password_hash, full_name, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [
      userId,
      googleUser.email,
      passwordHash,
      googleUser.name || googleUser.email,
      current,
      current,
    ],
  );

  await linkOAuthAccount(db, userId, googleUser.id, googleUser.email);

  return {
    id: userId,
    email: googleUser.email,
    full_name: googleUser.name || googleUser.email,
    status: "active",
  };
}

/**
 * Default organization name for Google signups, mirroring the register
 * form's required "nama usaha". Users can rename it from settings.
 */
function defaultOrganizationName(googleUser: GoogleUserInfo): string {
  const firstName = (googleUser.name || "").trim().split(/\s+/)[0];
  if (firstName) return `Bisnis ${firstName}`;
  const localPart = (googleUser.email || "").split("@")[0];
  return localPart ? `Bisnis ${localPart}` : "Usaha Saya";
}

/**
 * Complete Google OAuth flow: exchange code, find/create user (with org +
 * default COA for new signups, matching the email register flow), create session.
 */
export async function completeGoogleAuth(
  db: D1Database,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  request: Request,
): Promise<CreatedSession> {
  const googleUser = await exchangeCodeForUser(code, clientId, clientSecret, redirectUri);

  if (!googleUser.email) {
    throw badRequest("oauth_no_email", "Google account does not have an email");
  }

  const current = Date.now();
  let user = await findUserByGoogleId(db, googleUser.id);

  if (!user) {
    user = await findUserByEmail(db, googleUser.email);

    if (user) {
      // Email match: only auto-link when Google confirms the email is verified.
      // Google's verified_email flag is trusted - email ownership is already
      // proven by Google's account creation process.
      if (!googleUser.verified_email) {
        throw conflict(
          "oauth_email_conflict",
          "Email Google tidak terverifikasi. Masuk dengan password terlebih dahulu.",
        );
      }

      await linkOAuthAccount(db, user.id, googleUser.id, googleUser.email);
      await logAuthEvent(db, user.id, user.id, "oauth_link", { provider: "google" });
    } else {
      // New user: create user + organization + default COA (same as register)
      user = await createUserFromGoogle(db, googleUser);
      const organization = await createOrganizationWithOwner(
        db,
        user.id,
        defaultOrganizationName(googleUser),
        current,
      );
      await logAuthEvent(db, user.id, user.id, "registration", {
        email: googleUser.email,
        organizationId: organization.id,
        provider: "google",
      });
      return createSession(db, user.id, request, organization.id);
    }
  }

  if (user.status !== "active") {
    throw unauthorized("Akun dinonaktifkan.");
  }

  await logAuthEvent(db, user.id, user.id, "oauth_login", { provider: "google" });
  return createSession(db, user.id, request);
}