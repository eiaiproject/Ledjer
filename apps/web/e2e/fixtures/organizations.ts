/**
 * Organization seed helpers for E2E tests using Cloudflare Worker API.
 * No Supabase dependency — all org creation goes through /api/organizations/*.
 */

import { E2E } from "./env";
import { type TestUser } from "./users";
import { registerUser, loginViaAPI } from "./auth";

export interface TestOrg {
  id: string;
  name: string;
}

/**
 * Register a user, login, and create an organization via Worker API.
 * Returns the organization ID and sets up the user's current org.
 */
export async function seedOrganization(
  user: TestUser,
  orgName?: string,
): Promise<TestOrg> {
  // Register user
  await registerUser(user);

  // Login to get session token
  const sessionToken = await loginViaAPI(user);

  // Create organization via API with session cookie
  const name = orgName || `[E2E] Org ${Date.now()}`;
  const res = await fetch(`${E2E.baseUrl}/api/organizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `ledjer_session=${sessionToken}`,
    },
    body: JSON.stringify({
      name,
      businessType: "simple_trading",
      booksStartDate: new Date().toISOString().split("T")[0],
      defaultCashAccountName: "Kas Utama",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create org: ${res.status} ${text}`);
  }

  const data = await res.json();
  return { id: data.organizationId || data.id, name };
}

/**
 * Ensure the owner has an organization. Idempotent.
 */
export async function ensureOwnerOrg(user: TestUser): Promise<TestOrg> {
  const token = await loginViaAPI(user);
  const currentRes = await fetch(`${E2E.baseUrl}/api/organizations/current`, {
    headers: { Cookie: `ledjer_session=${token}` },
  });

  if (currentRes.ok) {
    const data = await currentRes.json();
    if (data?.organization?.id) {
      return { id: data.organization.id, name: data.organization.name };
    }
  }

  // Create new org
  return seedOrganization(user);
}
