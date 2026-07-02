import { test, expect } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER, E2E_OWNER2 } from "./fixtures/users";
import { ensureTestUser, loginUser, seedOrganization } from "./fixtures/seed";
import { getOrgAccounts } from "./fixtures/accounts";

/**
 * Account code generation hardening regression tests.
 *
 * Verifies that create_cash_bank_account produces correct sequential codes,
 * avoids duplicating default chart of accounts codes (1110, 1120), handles
 * concurrent creation safely, and rejects cross-org mutations.
 */

async function callCreateAccount(
  token: string,
  orgId: string,
  name: string,
  kind: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/rpc/create_cash_bank_account`,
    {
      method: "POST",
      headers: {
        apikey: E2E.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_organization_id: orgId,
        p_account_name: name,
        p_kind: kind,
      }),
    },
  );
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function createFreshOrg(ownerEmail: string, ownerPassword: string) {
  const user = { email: ownerEmail, password: ownerPassword, fullName: "Test Owner", role: "owner" as const };
  await ensureTestUser(user);
  const ownerId = await ensureTestUser(user);
  const orgId = await seedOrganization(ownerId, e2eName(`Acct Test ${Date.now()}`));
  const token = await loginUser(user);
  return { orgId, token };
}

if (E2E.isFullLocal) {
  test.describe("Account Code Generation Hardening", () => {
    test.beforeAll(async () => {
      await ensureTestUser(E2E_OWNER);
      await ensureTestUser(E2E_OWNER2);
    });

    test("first cash account after onboarding gets code 1111 and preserves default 1110", async () => {
      const { orgId, token } = await createFreshOrg(E2E_OWNER.email, E2E_OWNER.password);

      // Verify default Kas (1110) exists
      const accountsBefore = await getOrgAccounts(orgId);
      const defaultCash = accountsBefore.find((a) => a.code === 1110);
      expect(defaultCash).toBeTruthy();

      // Create first additional cash account
      const result = await callCreateAccount(token, orgId, "Kas Tambahan", "cash");
      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("id");
      expect(result.body).toHaveProperty("code");
      expect((result.body as Record<string, unknown>).code).toBe(1111);
      expect((result.body as Record<string, unknown>).name).toBe("Kas Tambahan");

      // Verify DB state
      const accountsAfter = await getOrgAccounts(orgId);
      const defaultStillExists = accountsAfter.find((a) => a.code === 1110);
      expect(defaultStillExists).toBeTruthy();
      const newAccount = accountsAfter.find((a) => a.code === 1111);
      expect(newAccount).toBeTruthy();
      expect(newAccount!.name).toBe("Kas Tambahan");

      // No duplicate codes
      const codes = accountsAfter.map((a) => a.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    test("first bank account after onboarding gets code 1121 and preserves default 1120", async () => {
      const { orgId, token } = await createFreshOrg(E2E_OWNER.email, E2E_OWNER.password);

      // Verify default Bank (1120) exists
      const accountsBefore = await getOrgAccounts(orgId);
      const defaultBank = accountsBefore.find((a) => a.code === 1120);
      expect(defaultBank).toBeTruthy();

      // Create first additional bank account
      const result = await callCreateAccount(token, orgId, "Bank Tambahan", "bank");
      expect(result.status).toBe(200);
      expect((result.body as Record<string, unknown>).code).toBe(1121);
      expect((result.body as Record<string, unknown>).name).toBe("Bank Tambahan");

      // Verify DB state
      const accountsAfter = await getOrgAccounts(orgId);
      const defaultStillExists = accountsAfter.find((a) => a.code === 1120);
      expect(defaultStillExists).toBeTruthy();
      const newAccount = accountsAfter.find((a) => a.code === 1121);
      expect(newAccount).toBeTruthy();
    });

    test("concurrent cash account creation produces unique sequential codes without duplicates", async () => {
      const { orgId, token } = await createFreshOrg(E2E_OWNER.email, E2E_OWNER.password);

      // Fire 4 parallel create requests
      const results = await Promise.all([
        callCreateAccount(token, orgId, "Kas A", "cash"),
        callCreateAccount(token, orgId, "Kas B", "cash"),
        callCreateAccount(token, orgId, "Kas C", "cash"),
        callCreateAccount(token, orgId, "Kas D", "cash"),
      ]);

      // All should succeed
      for (const r of results) {
        expect(r.status).toBe(200);
        expect(r.body).toHaveProperty("id");
        expect(r.body).toHaveProperty("code");
      }

      // All codes should be unique
      const codes = results.map((r) => (r.body as Record<string, unknown>).code as number).sort();
      expect(new Set(codes).size).toBe(4);

      // Should be in the 1111-1119 range (sequential)
      expect(codes[0]).toBeGreaterThanOrEqual(1111);
      expect(codes[3]).toBeLessThanOrEqual(1119);

      // Verify DB state
      const accountsAfter = await getOrgAccounts(orgId);
      const cashAccounts = accountsAfter.filter(
        (a) => a.code >= 1111 && a.code <= 1119 && a.name.startsWith("Kas "),
      );
      expect(cashAccounts).toHaveLength(4);

      // No duplicate codes anywhere
      const allCodes = accountsAfter.map((a) => a.code);
      expect(new Set(allCodes).size).toBe(allCodes.length);
    });

    test("cross-org create_cash_bank_account mutation is rejected", async () => {
      // Create two separate orgs with different owners
      // seedOrganization(ownerId, name, ownerUser) — pass the owner user explicitly
      const owner1Id = await ensureTestUser(E2E_OWNER);
      const owner2Id = await ensureTestUser(E2E_OWNER2);
      await seedOrganization(owner1Id, e2eName(`CrossOrg1 ${Date.now()}`), E2E_OWNER);
      const org2Id = await seedOrganization(owner2Id, e2eName(`CrossOrg2 ${Date.now()}`), E2E_OWNER2);

      // Login as owner of org1
      const token1 = await loginUser(E2E_OWNER);

      // Owner of org1 tries to create account in org2 — should be rejected
      const result = await callCreateAccount(token1, org2Id, "Cross Org Hack", "cash");
      expect(result.status).toBeGreaterThanOrEqual(400);

      // Verify org2 is unchanged
      const accountsAfter = await getOrgAccounts(org2Id);
      const hackAccount = accountsAfter.find((a) => a.name === "Cross Org Hack");
      expect(hackAccount).toBeFalsy();
    });
  });
}
