/**
 * Safe cleanup of E2E test data.
 *
 * NEVER delete non-E2E data. All operations use strict E2E filters.
 */
import { E2E, e2eName } from "./env";
import { ALL_TEST_USERS } from "./users";

const SHARED_ORG_NAME = e2eName("Toko Otomatis");
const SHARED_USER_EMAILS = ALL_TEST_USERS.map((user) => user.email);

interface CleanupOptions {
  includeSharedFixtures?: boolean;
}

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

/**
 * Delete E2E-prefixed organizations and cascade-related data.
 * Safe to run against any database (only touches E2E data).
 */
export async function cleanupE2EOrganizations(
  options: CleanupOptions = {},
): Promise<void> {
  if (!E2E.hasServiceRole) return;

  // Delete E2E organizations (cascades to members, transactions, journals, etc.)
  const nameFilter = encodeURIComponent("[E2E]*");
  const sharedFilter = options.includeSharedFixtures
    ? ""
    : `&name=neq.${encodeURIComponent(SHARED_ORG_NAME)}`;
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?name=like.${nameFilter}${sharedFilter}`,
    { method: "DELETE", headers: SR_HEADERS },
  ).catch(() => {});
}

/**
 * Delete E2E test auth users.
 */
export async function cleanupE2EUsers(
  options: CleanupOptions = {},
): Promise<void> {
  if (!E2E.hasServiceRole) return;

  const e2eEmails = options.includeSharedFixtures ? SHARED_USER_EMAILS : [];

  for (const email of e2eEmails) {
    const listRes = await fetch(
      `${E2E.supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`,
      { headers: SR_HEADERS },
    );
    if (!listRes.ok) continue;
    const data = await listRes.json();
    const user = data.users?.find((u: { email: string }) => u.email === email);
    if (user) {
      await fetch(`${E2E.supabaseUrl}/auth/v1/admin/users/${user.id}`, {
        method: "DELETE",
        headers: SR_HEADERS,
      }).catch(() => {});
    }
  }
}

/**
 * Delete stale login_attempts for E2E users to prevent rate-limit lockout
 * from accumulated failed attempts across retries.
 */
export async function cleanupLoginAttempts(): Promise<void> {
  if (!E2E.hasServiceRole) return;

  for (const email of SHARED_USER_EMAILS) {
    const encoded = encodeURIComponent(email);
    await fetch(
      `${E2E.supabaseUrl}/rest/v1/login_attempts?email=eq.${encoded}`,
      { method: "DELETE", headers: SR_HEADERS },
    ).catch(() => {});
  }
}

/**
 * Full cleanup: organizations first (FK), then users, then login rate limits.
 */
export async function fullCleanup(): Promise<void> {
  await cleanupE2EOrganizations({ includeSharedFixtures: true });
  await cleanupE2EUsers({ includeSharedFixtures: true });
  await cleanupLoginAttempts();
}
