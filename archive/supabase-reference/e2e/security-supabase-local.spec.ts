import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";

/**
 * Supabase-specific security tests — local only.
 * Requires running Supabase with service role key.
 */


const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

if (E2E.isFullLocal && E2E.hasServiceRole) {
test.describe("RLS: organizations", () => {
  test("unauthenticated anon cannot read other orgs", async ({ request }) => {
    const response = await request.get(
      `${E2E.supabaseUrl}/rest/v1/organizations?select=*`,
      { headers: { apikey: E2E.supabaseAnonKey } },
    );

    if (response.ok()) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
      expect(data.length).toBe(0);
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test("anon cannot insert into organizations", async ({ request }) => {
    const response = await request.post(
      `${E2E.supabaseUrl}/rest/v1/organizations`,
      {
        headers: {
          apikey: E2E.supabaseAnonKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        data: { name: "[E2E] RLS bypass attempt" },
      },
    );
    // Should be blocked by RLS (403/401) or RLS policy violation
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("RLS: transactions", () => {
  test("anon cannot read transactions without org context", async ({ request }) => {
    const response = await request.get(
      `${E2E.supabaseUrl}/rest/v1/transactions?select=*`,
      { headers: { apikey: E2E.supabaseAnonKey } },
    );

    if (response.ok()) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
      expect(data.length).toBe(0);
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });
});

test.describe("RPC security", () => {
  test("anon cannot call sensitive RPCs without auth", async ({ request }) => {
    const response = await request.post(
      `${E2E.supabaseUrl}/rest/v1/rpc/create_organization_with_opening_balances`,
      {
        headers: {
          apikey: E2E.supabaseAnonKey,
          "Content-Type": "application/json",
        },
        data: {
          p_organization_name: "[E2E] RPC bypass",
          p_business_type: "simple_trading",
          p_books_start_date: "2024-01-01",
          p_default_cash_account_name: "Kas",
          p_opening_cash_balance: 0,
          p_extra_opening_balances: [],
        },
      },
    );
    // Should be blocked by RLS or function permissions
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("Service role access", () => {
  test("service role can read organizations", async ({ request }) => {
    const response = await request.get(
      `${E2E.supabaseUrl}/rest/v1/organizations?select=id,name&limit=5`,
      { headers: SR_HEADERS },
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test("service role can read users list", async ({ request }) => {
    const response = await request.get(
      `${E2E.supabaseUrl}/auth/v1/admin/users?page=1&per_page=5`,
      { headers: SR_HEADERS },
    );
    expect(response.ok()).toBeTruthy();
  });
});

}