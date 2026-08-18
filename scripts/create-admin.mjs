#!/usr/bin/env node
/**
 * Create a platform admin account (admin_users) with a PBKDF2 hash.
 *
 * Usage:
 *   node scripts/create-admin.mjs <email> <full-name> <password>
 *
 * Requires: wrangler authenticated against the target environment.
 * By default targets the production D1 database (ledjer-production).
 * Pass --staging to target the staging database instead.
 */
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

const encoder = new TextEncoder();

// ── PBKDF2 config (must match apps/admin/worker/auth/password.ts) ──
const HASH_NAME = "PBKDF2";
const DIGEST = "SHA-256";
const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const FORMAT = "pbkdf2-sha256";

function utf8(value) {
  return encoder.encode(value);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

async function deriveBits(password, salt, pepper = "") {
  const material = utf8(`${password}\u0000${pepper}`);
  const key = await crypto.subtle.importKey(
    "raw", material, HASH_NAME, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: HASH_NAME, hash: DIGEST, salt, iterations: ITERATIONS },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

async function hashPassword(password, pepper = "") {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveBits(password, salt, pepper);
  return `${FORMAT}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

// ── Main ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const staging = args.includes("--staging");
const positional = args.filter((a) => !a.startsWith("--"));
const [email, fullName, password] = positional;

if (!email || !fullName || !password) {
  console.error("Usage: node scripts/create-admin.mjs <email> <full-name> <password> [--staging]");
  console.error("  email     - email of the admin account (lowercased)");
  console.error("  full-name - display name");
  console.error("  password  - minimum 8 chars, must have uppercase + digit");
  process.exit(1);
}

if (password.length < 8) {
  console.error("❌ Password must be at least 8 characters");
  process.exit(1);
}
if (!/[A-Z]/.test(password)) {
  console.error("❌ Password must contain at least 1 uppercase letter");
  process.exit(1);
}
if (!/\d/.test(password)) {
  console.error("❌ Password must contain at least 1 digit");
  process.exit(1);
}

const normalizedEmail = email.trim().toLowerCase();
const now = Date.now();
const adminId = randomUUID();

console.log(`🔐 Generating PBKDF2 hash for: ${normalizedEmail}`);
const hash = await hashPassword(password);
console.log(`✅ Hash generated (${hash.length} chars)`);

// Guard against duplicates (admin_users.email is unique).
const sql = `
INSERT INTO admin_users (id, email, password_hash, full_name, status, created_at, updated_at)
VALUES ('${adminId}', '${normalizedEmail}', '${hash}', '${fullName.replace(/'/g, "''")}', 'active', ${now}, ${now})
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  full_name = excluded.full_name,
  status = 'active',
  updated_at = excluded.updated_at;
`;

const tmpFile = `/tmp/ledjer-admin-${Date.now()}.sql`;
writeFileSync(tmpFile, sql);

const dbName = staging ? "ledjer-staging" : "ledjer-production";
try {
  execSync(
    `npx wrangler d1 execute ${dbName} --remote --file "${tmpFile}"`,
    { stdio: "inherit", cwd: process.cwd() + "/apps/web" },
  );
  console.log(`\n✅ Admin ${normalizedEmail} created/updated in ${dbName}.`);
  console.log(`   Log in at ${staging ? "https://ledjer-admin-staging.eiai.workers.dev" : "https://admin.ledjer.id"} (after deployment).`);
  console.log(`   NOTE: if ADMIN_PASSWORD_PEPPER is configured on the worker, this password will NOT verify.`);
  console.log(`         Either leave the pepper unset, or provision via a one-time script using the same pepper.`);
} catch (err) {
  console.error("\n❌ Failed to update database:", err.message);
  process.exit(1);
} finally {
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
}
