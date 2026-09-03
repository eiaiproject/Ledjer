#!/usr/bin/env node
/**
 * Creates a session in a target D1 for Playwright E2E auth, bypassing the
 * login rate limit during full-suite runs.
 * Outputs: PLAYWRIGHT_SESSION_TOKEN=<raw-token> and SESSION_ID=<id>
 *
 * Usage (from repo root):
 *   eval $(node scripts/create-e2e-session.mjs)                # prod default
 *   E2E_D1=ledjer-staging E2E_EMAIL=staging@yopmail.com \
 *     node scripts/create-e2e-session.mjs                      # staging/CI
 *
 * The session user is resolved by E2E_EMAIL when provided (staging user),
 * otherwise the legacy production E2E user id is used.
 */
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const D1_DATABASE = process.env.E2E_D1 || "ledjer-production";
const E2E_EMAIL = process.env.E2E_EMAIL;
// Production E2E user (ledjer@yopmail.com) - preserved default.
const DEFAULT_USER_ID = "48c39f87-6d7b-43bf-92b9-6d127a9eec03";

// Generate token matching Worker's generateToken()
function generateToken() {
  return randomBytes(32).toString("base64url");
}

const rawToken = generateToken();
const tokenHash = createHash("sha256").update(rawToken).digest("hex");

const sessionId = randomUUID();
const now = Date.now();
const expiresAt = now + 7 * 86_400_000; // 7 days

// Resolve the target user: staging/CI resolves by email, prod keeps the
// legacy hardcoded id so existing local prod runs behave unchanged.
const insertValuesSql = E2E_EMAIL
  ? `SELECT '${sessionId}', id, '${tokenHash}', '127.0.0.1', ${expiresAt}, ${now}, ${now}
     FROM users WHERE email = '${E2E_EMAIL.replaceAll("'", "''")}'`
  : `VALUES ('${sessionId}', '${DEFAULT_USER_ID}', '${tokenHash}', '127.0.0.1', ${expiresAt}, ${now}, ${now})`;

const sql = [
  "INSERT INTO sessions (id, user_id, token_hash, ip_address, expires_at, last_used_at, created_at)",
  insertValuesSql,
  ";",
].join(" ");

try {
  // Write SQL to temp file to avoid shell escaping complexity
  const tmpFile = `/tmp/ledjer-e2e-session-${sessionId}.sql`;
  writeFileSync(tmpFile, sql);
  execSync(
    `npx wrangler d1 execute ${D1_DATABASE} --remote --file "${tmpFile}"`,
    { stdio: "pipe", cwd: process.cwd() + "/apps/web" },
  );
  unlinkSync(tmpFile);
  console.log(`PLAYWRIGHT_SESSION_TOKEN=${rawToken}`);
  console.log(`SESSION_ID=${sessionId}`);
} catch (err) {
  console.error(
    `Failed to create session in D1 '${D1_DATABASE}'` +
      (E2E_EMAIL ? ` for '${E2E_EMAIL}'` : "") +
      `: ${err.message}`,
  );
  process.exit(1);
}
