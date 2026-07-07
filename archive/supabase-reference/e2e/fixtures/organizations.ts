import { E2E, e2eName } from "./env";
import { E2E_OWNER } from "./users";
import { ensureTestUser, seedOrganization } from "./seed";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

export interface TestOrg {
  id: string;
  name: string;
}

/**
 * Ensure the owner has an organization. Returns org record.
 * Idempotent: if org already exists, returns it.
 */
export async function ensureOwnerOrg(): Promise<TestOrg> {
  const ownerId = await ensureTestUser(E2E_OWNER);

  // Check for existing org
  const listRes = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_members?user_id=eq.${ownerId}&status=eq.active&select=organization_id,organizations(id,name)`,
    { headers: SR_HEADERS },
  );

  if (listRes.ok) {
    const members = await listRes.json();
    if (members?.length > 0) {
      const org = members[0].organizations;
      if (org) return { id: org.id, name: org.name };
    }
  }

  // Create new org
  const orgId = await seedOrganization(ownerId);
  return { id: orgId, name: e2eName("Toko Otomatis") };
}
