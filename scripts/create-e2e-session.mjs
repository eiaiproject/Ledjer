#!/usr/bin/env node
/**
 * Creates a session in production D1 for Playwright E2E auth.
 * Outputs: PLAYWRIGHT_SESSION_TOKEN=<raw-token>
 *
 * Usage:
 *   eval $(node scripts/create-e2e-session.mjs)
 *   pnpm exec playwright test ...
 */
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const USER_ID = "48c39f87-6d7b-43bf-92b9-6d127a9eec03";

// Generate token matching Worker's generateToken()
function generateToken() {
  const bytes = randomBytes(32);
  const result = bytes.toString("base64url");
  return result;
}

const rawToken = generateToken();
const tokenHash = createHash("sha256").update(rawToken).digest("hex");

const sessionId = randomUUID();
const now = Date.now();
const expiresAt = now + 7 * 86_400_000; // 7 days

const sql = [
  "INSERT INTO sessions (id, user_id, token_hash, ip_address, expires_at, last_used_at, created_at)",
  `VALUES ('${sessionId}', '${USER_ID}', '${tokenHash}', '127.0.0.1', ${expiresAt}, ${now}, ${now});`,
].join(" ");

try {
  // Write SQL to temp file to avoid shell escaping complexity
  const tmpFile = `/tmp/ledjer-e2e-session-${sessionId}.sql`;
  writeFileSync(tmpFile, sql);
  execSync(
    `npx wrangler d1 execute ledjer-production --remote --file "${tmpFile}"`,
    { stdio: "pipe", cwd: process.cwd() + "/apps/web" },
  );
  unlinkSync(tmpFile);
  console.log(`PLAYWRIGHT_SESSION_TOKEN=${rawToken}`);
  console.log(`SESSION_ID=${sessionId}`);
} catch (err) {
  console.error("Failed to create session:", err.message);
  process.exit(1);
}
