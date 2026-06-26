/**
 * Safe cleanup of E2E test data.
 *
 * NEVER delete non-E2E data. All operations use strict E2E filters.
 */
import { E2E } from "./env";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

/**
 * Delete E2E-prefixed organizations and cascade-related data.
 * Safe to run against any database (only touches E2E data).
 */
export async function cleanupE2EOrganizations(): Promise<void> {
  if (!E2E.hasServiceRole) return;

  // Delete E2E organizations (cascades to members, transactions, journals, etc.)
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?name=like.[E2E]*&name=not=is.null`,
    { method: "DELETE", headers: SR_HEADERS },
  ).catch(() => {});
}

/**
 * Delete E2E test auth users.
 */
export async function cleanupE2EUsers(): Promise<void> {
  if (!E2E.hasServiceRole) return;

  const e2eEmails = [
    "e2e-owner@ledjer.test",
    "e2e-staff@ledjer.test",
    "e2e-owner2@ledjer.test",
  ];

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
 * Full cleanup: organizations first (FK), then users.
 */
export async function fullCleanup(): Promise<void> {
  await cleanupE2EOrganizations();
  await cleanupE2EUsers();
}
