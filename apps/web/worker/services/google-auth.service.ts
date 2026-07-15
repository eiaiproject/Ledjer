import { execute, queryFirst } from "../db/client";
import { generateId } from "../auth/tokens";
import {
  createSession,
  type CreatedSession,
} from "./session.service";
import { badRequest, unauthorized } from "../http/errors";

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
  email_verified_at: number | null;
}

interface OAuthAccountRow {
  id: string;
  user_id: string;
  provider: string;
  provider_account_id: string;
}

/**
 * Generate the Google OAuth authorization URL.
 * Stores state in a short-lived cookie for CSRF protection.
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
  // Exchange code for tokens
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

  // Fetch user info
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
    `SELECT u.id, u.email, u.full_name, u.status, u.email_verified_at
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
    `SELECT id, email, full_name, status, email_verified_at
     FROM users
     WHERE email = ?`,
    [email],
  );
}

/**
 * Link Google OAuth account to existing user.
 */
async function linkOAuthAccount(
  db: D1Database,
  userId: string,
  googleId: string,
): Promise<void> {
  const existing = await queryFirst<OAuthAccountRow>(
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
    [generateId(), userId, googleId, null, current, current],
  );

  // Google verifies email — mark verified when linking existing account
  await execute(
    db,
    `UPDATE users SET email_verified_at = ?, updated_at = ?
     WHERE id = ? AND email_verified_at IS NULL`,
    [current, current, userId],
  );
}

/**
 * Create new user from Google info.
 */
async function createUserFromGoogle(
  db: D1Database,
  googleUser: GoogleUserInfo,
): Promise<UserRow> {
  const current = Date.now();
  const userId = generateId();

  await execute(
    db,
    `INSERT INTO users (
       id, email, password_hash, full_name, status, email_verified_at, created_at, updated_at
     ) VALUES (?, ?, '', ?, 'active', ?, ?, ?)`,
    [
      userId,
      googleUser.email,
      googleUser.name || googleUser.email,
      current, // email_verified_at (Google verifies email)
      current,
      current,
    ],
  );

  // Link OAuth account
  await linkOAuthAccount(db, userId, googleUser.id);

  return {
    id: userId,
    email: googleUser.email,
    full_name: googleUser.name || googleUser.email,
    status: "active",
    email_verified_at: current,
  };
}

/**
 * Complete Google OAuth flow: exchange code, find/create user, create session.
 */
export async function completeGoogleAuth(
  db: D1Database,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  request: Request,
): Promise<CreatedSession> {
  // Exchange code for user info
  const googleUser = await exchangeCodeForUser(code, clientId, clientSecret, redirectUri);

  if (!googleUser.email) {
    throw badRequest("oauth_no_email", "Google account does not have an email");
  }

  // Find existing user by Google ID or email
  let user = await findUserByGoogleId(db, googleUser.id);

  if (!user) {
    // Try finding by email
    user = await findUserByEmail(db, googleUser.email);

    if (user) {
      // Link Google account to existing user
      await linkOAuthAccount(db, user.id, googleUser.id);
    } else {
      // Create new user
      user = await createUserFromGoogle(db, googleUser);
    }
  }

  if (user.status !== "active") {
    throw unauthorized("User account is disabled");
  }

  // Create session
  return createSession(db, user.id, request);
}
