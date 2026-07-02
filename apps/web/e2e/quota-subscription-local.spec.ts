import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { E2E_OWNER, E2E_STAFF } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  loginUser,
} from "./fixtures/seed";
import { getCashAccount } from "./fixtures/accounts";
import { cleanupE2EOrganizations, cleanupE2EUsers } from "./fixtures/cleanup";
import {
  createCheckoutSession,
  getOrganization,
} from "./fixtures/billing";

// ── Helpers ──────────────────────────────────────────────────────────────

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

function userHeaders(token: string) {
  return {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function rpc(
  token: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function rpcServiceRole(
  fn: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: SR_HEADERS,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function setOrgPlan(
  orgId: string,
  plan: "free" | "solo" | "business",
): Promise<void> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: SR_HEADERS,
      body: JSON.stringify({
        current_plan: plan,
        subscription_status: plan === "free" ? null : "active",
      }),
    },
  );
  expect(res.ok).toBe(true);
}

async function postCashSale(
  token: string,
  orgId: string,
  cashAccountId: string,
  i: number,
): Promise<{ status: number; data: unknown }> {
  return rpc(token, "post_transaction", {
    p_organization_id: orgId,
    p_transaction_date: new Date().toISOString().split("T")[0],
    p_transaction_type: "cash_sale",
    p_amount: 10_000 + i,
    p_payment_status: "paid",
    p_description: `[E2E] Quota txn ${i}`,
    p_cash_account_id: cashAccountId,
    p_client_token: crypto.randomUUID(),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe("Quota + subscription enforcement", () => {
  test.skip(!E2E.isFullLocal, "Butuh local Supabase + service role key");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await ensureTestUser(E2E_OWNER);
    await ensureTestUser(E2E_STAFF);
  });

  test.afterAll(async () => {
    await cleanupE2EOrganizations();
    await cleanupE2EUsers();
  });

  // ── Free plan limit + paid webhook unlock ─────────────────────────────

  test.describe("free plan transaction limit + paid webhook unlock", () => {
    let ownerId: string;
    let ownerToken: string;
    let orgId: string;
    let cashAccountId: string;

    test.beforeAll(async () => {
      ownerId = await ensureTestUser(E2E_OWNER);
      ownerToken = await loginUser(E2E_OWNER);
      orgId = await seedOrganization(
        ownerId,
        `[E2E] Quota Org ${Date.now()}`,
        E2E_OWNER,
      );
      cashAccountId = (await getCashAccount(orgId)).id;
      await setOrgPlan(orgId, "free");
    });

    test("free plan limit enforced server-side: 50 pass, 51st fails", async () => {
      for (let i = 1; i <= 50; i += 1) {
        const res = await postCashSale(ownerToken, orgId, cashAccountId, i);
        expect(res.status).toBe(200);
      }

      const overLimit = await postCashSale(
        ownerToken,
        orgId,
        cashAccountId,
        51,
      );
      expect(overLimit.status).not.toBe(200);

      const msg = JSON.stringify(overLimit.data ?? "").toLowerCase();
      expect(msg).toMatch(/50|limit|gratis|free|kuota/);
    });

    test("get_monthly_usage returns correct count / limit / remaining", async () => {
      const usage = await rpc(ownerToken, "get_monthly_usage", {
        p_org_id: orgId,
      });
      expect(usage.status).toBe(200);

      const data = usage.data as {
        count: number;
        limit: number;
        remaining: number;
        period_start: string;
        period_end: string;
      };

      expect(data.count).toBe(50);
      expect(data.limit).toBe(50);
      expect(data.remaining).toBe(0);
      expect(data.period_start).toBeTruthy();
      expect(data.period_end).toBeTruthy();
    });

    test("paid webhook unlocks quota / plan", async () => {
      const session = await createCheckoutSession(
        orgId,
        `quota_inv_${Date.now()}`,
        `quota_trx_${Date.now()}`,
        { plan: "solo", billing_period: "monthly", amount: 39_000 },
      );

      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const finalize = await rpcServiceRole("finalize_mayar_payment", {
        p_session_id: session.id,
        p_organization_id: orgId,
        p_actor_user_id: ownerId,
        p_plan: "solo",
        p_billing_period: "monthly",
        p_amount: 39_000,
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
        p_provider_transaction_id: `paid_trx_${Date.now()}`,
        p_provider_customer_id: `cust_${Date.now()}`,
        p_webhook_payload: { source: "e2e" },
        p_provider_response: { ok: true },
      });
      expect(finalize.status).toBe(200);

      const org = await getOrganization(orgId);
      expect(org?.current_plan).toBe("solo");
      expect(org?.subscription_status).toBe("active");

      // Transaction 51 should now succeed
      const nextTx = await postCashSale(
        ownerToken,
        orgId,
        cashAccountId,
        52,
      );
      expect(nextTx.status).toBe(200);
    });
  });

  // ── Client cannot patch plan directly ─────────────────────────────────
  // protect_organization_billing_columns trigger blocks authenticated users
  // from modifying current_plan, subscription_status, etc.

  test("authenticated client cannot patch organizations.current_plan directly", async () => {
    const ownerId = await ensureTestUser(E2E_OWNER);
    const ownerToken = await loginUser(E2E_OWNER);
    const orgId = await seedOrganization(
      ownerId,
      `[E2E] Client Plan Patch ${Date.now()}`,
      E2E_OWNER,
    );

    await setOrgPlan(orgId, "free");

    // Try to upgrade plan via client-side PATCH (should fail due to trigger)
    const res = await fetch(
      `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`,
      {
        method: "PATCH",
        headers: {
          ...userHeaders(ownerToken),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          current_plan: "business",
          subscription_status: "active",
        }),
      },
    );

    const body = await res.json().catch(() => null);

    // protect_organization_billing_columns trigger should block this
    // The trigger may raise an exception (400/500) or PostgREST may
    // return an error in the response body
    const isBlocked =
      !res.ok ||
      (Array.isArray(body) && body.length === 0) ||
      (body && typeof body === "object" && "message" in body) ||
      (body && typeof body === "object" && "code" in body);

    expect(isBlocked).toBe(true);

    const org = await getOrganization(orgId);
    expect(org?.current_plan).toBe("free");
  });

  // ── Business plan required for invites ────────────────────────────────

  test("business plan required for invites: free and solo both fail", async () => {
    const ownerId = await ensureTestUser(E2E_OWNER);
    const ownerToken = await loginUser(E2E_OWNER);
    const orgId = await seedOrganization(
      ownerId,
      `[E2E] Invite Plan Gate ${Date.now()}`,
      E2E_OWNER,
    );

    for (const plan of ["free", "solo"] as const) {
      await setOrgPlan(orgId, plan);

      const res = await rpc(ownerToken, "create_invitation", {
        p_organization_id: orgId,
        p_email: E2E_STAFF.email,
      });

      expect(res.status).not.toBe(200);
      const msg = JSON.stringify(res.data ?? "").toLowerCase();
      expect(msg).toMatch(
        /business|paket business|invite staf memerlukan paket business/,
      );
    }
  });
});
