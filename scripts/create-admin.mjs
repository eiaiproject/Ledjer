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
import { randomUUID } from "node:crypto";
import { hashPassword, validatePasswordOrExit } from "./lib/password.mjs";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

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

validatePasswordOrExit(password);

const normalizedEmail = email.trim().toLowerCase();
const now = Date.now();
const adminId = randomUUID();

console.log(`🔐 Generating PBKDF2 hash for: ${normalizedEmail}`);
const hash = await hashPassword(password);
console.log(`✅ Hash generated (${hash.length} chars)`);

// Guard against duplicates (admin_users.email is unique).
const sql = `
INSERT INTO admin_users (id, email, password_hash, full_name, status, created_at, updated_at)
VALUES ('${adminId}', '${normalizedEmail}', '${hash}', '${fullName.replaceAll("'", "''")}', 'active', ${now}, ${now})
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
