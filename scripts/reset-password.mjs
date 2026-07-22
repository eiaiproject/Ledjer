#!/usr/bin/env node
/**
 * Reset password for a user by generating a new PBKDF2 hash
 * and updating the database directly.
 *
 * Usage:
 *   node scripts/reset-password.mjs <email> <new-password>
 *
 * Requires: wrangler authenticated
 */
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const encoder = new TextEncoder();

// ── PBKDF2 config (must match password.ts) ──────────────────────
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
const [,, email, password] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/reset-password.mjs <email> <new-password>");
  console.error("  email        - email of the user to reset");
  console.error("  new-password - minimum 8 chars, must have uppercase + digit");
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

console.log(`🔐 Generating hash for: ${email}`);
const hash = await hashPassword(password);
console.log(`✅ Hash generated (${hash.length} chars)`);

const sql = `UPDATE users SET password_hash = '${hash}', updated_at = ${Date.now()} WHERE email = '${email.toLowerCase().trim()}';`;
const tmpFile = `/tmp/ledjer-reset-${Date.now()}.sql`;
writeFileSync(tmpFile, sql);

try {
  execSync(
    `npx wrangler d1 execute ledjer-production --remote --file "${tmpFile}"`,
    { stdio: "inherit", cwd: process.cwd() + "/apps/web" },
  );
  console.log(`\n✅ Password for ${email} has been reset successfully!`);
  console.log(`   You can now login with your new password.`);
} catch (err) {
  console.error("\n❌ Failed to update database:", err.message);
  process.exit(1);
} finally {
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
}
