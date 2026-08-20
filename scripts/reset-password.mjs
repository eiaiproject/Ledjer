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
import { hashPassword, validatePasswordOrExit } from "./lib/password.mjs";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

// ── Main ────────────────────────────────────────────────────────
const [,, email, password] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/reset-password.mjs <email> <new-password>");
  console.error("  email        - email of the user to reset");
  console.error("  new-password - minimum 8 chars, must have uppercase + digit");
  process.exit(1);
}

validatePasswordOrExit(password);

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
