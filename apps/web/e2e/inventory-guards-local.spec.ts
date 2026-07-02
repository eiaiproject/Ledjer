import { test, expect } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  loginUser,
} from "./fixtures/seed";
import { getCashAccount } from "./fixtures/accounts";

import { createE2EProduct } from "./fixtures/products";
import { cleanupE2EOrganizations, cleanupE2EUsers } from "./fixtures/cleanup";

// ── Helpers ──────────────────────────────────────────────────────────────

function userHeaders(token: string) {
  return {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function rpc(
  token: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ status: number; data: unknown; error?: string }> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, error: !res.ok ? String(data) : undefined };
}

async function getProductStock(productId: string): Promise<number> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/products?id=eq.${productId}&select=current_stock`,
    { headers: SR_HEADERS },
  );
  const rows = await res.json();
  return Number(rows[0]?.current_stock ?? 0);
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe("Inventory: Guards", () => {
  test.skip(!E2E.isFullLocal, "Butuh local Supabase + service role key");
  test.describe.configure({ mode: "serial" });

  let ownerToken: string;
  let orgId: string;
  let cashAcctId: string;

  test.beforeAll(async () => {
    await ensureTestUser(E2E_OWNER);
    ownerToken = await loginUser(E2E_OWNER);
    orgId = await seedOrganization(
      (await ensureTestUser(E2E_OWNER)),
      e2eName("Inventory Guard Org"),
    );
    const cash = await getCashAccount(orgId);
    cashAcctId = cash.id;
  });

  test.afterAll(async () => {
    await cleanupE2EOrganizations();
    await cleanupE2EUsers();
  });

  // ── Stock cannot go negative ──────────────────────────────────────────

  test.describe("Stock cannot go negative", () => {
    let product: Awaited<ReturnType<typeof createE2EProduct>>;

    test.beforeAll(async () => {
      product = await createE2EProduct(orgId, {
        code: `E2E-INV-${Date.now()}`,
        name: e2eName("Produk Stock Guard"),
        purchasePrice: 10_000,
        sellingPrice: 15_000,
      });
    });

    test("cash purchase increases stock", async () => {
      const stockBefore = await getProductStock(product.id);

      const { status } = await rpc(ownerToken, "post_transaction", {
        p_organization_id: orgId,
        p_transaction_date: new Date().toISOString().split("T")[0],
        p_transaction_type: "cash_purchase",
        p_amount: 500_000,
        p_payment_status: "paid",
        p_description: e2eName("Pembelian stok awal"),
        p_cash_account_id: cashAcctId,
        p_product_id: product.id,
        p_quantity: 50,
        p_unit_price: 10_000,
        p_client_token: crypto.randomUUID(),
      });
      expect(status).toBe(200);

      const stockAfter = await getProductStock(product.id);
      expect(stockAfter - stockBefore).toBeCloseTo(50, 0);
    });

    test("selling more than available stock is rejected", async () => {
      const stockBefore = await getProductStock(product.id);

      const { status } = await rpc(ownerToken, "post_transaction", {
        p_organization_id: orgId,
        p_transaction_date: new Date().toISOString().split("T")[0],
        p_transaction_type: "cash_sale",
        p_amount: 1_500_000,
        p_payment_status: "paid",
        p_description: e2eName("Penjualan melebihi stok"),
        p_cash_account_id: cashAcctId,
        p_product_id: product.id,
        p_quantity: stockBefore + 100, // More than available
        p_unit_price: 15_000,
        p_client_token: crypto.randomUUID(),
      });

      // Should fail — stock insufficient
      expect(status).not.toBe(200);

      // Stock should remain unchanged
      const stockAfter = await getProductStock(product.id);
      expect(stockAfter).toBe(stockBefore);
    });

    test("selling exactly available stock succeeds", async () => {
      const stockBefore = await getProductStock(product.id);

      const { status } = await rpc(ownerToken, "post_transaction", {
        p_organization_id: orgId,
        p_transaction_date: new Date().toISOString().split("T")[0],
        p_transaction_type: "cash_sale",
        p_amount: stockBefore * 15_000,
        p_payment_status: "paid",
        p_description: e2eName("Penjualan habis stok"),
        p_cash_account_id: cashAcctId,
        p_product_id: product.id,
        p_quantity: stockBefore,
        p_unit_price: 15_000,
        p_client_token: crypto.randomUUID(),
      });
      expect(status).toBe(200);

      const stockAfter = await getProductStock(product.id);
      expect(stockAfter).toBeCloseTo(0, 0);
    });

    test("selling after stock is zero is rejected", async () => {
      const stockBefore = await getProductStock(product.id);
      expect(stockBefore).toBeCloseTo(0, 0);

      const { status } = await rpc(ownerToken, "post_transaction", {
        p_organization_id: orgId,
        p_transaction_date: new Date().toISOString().split("T")[0],
        p_transaction_type: "cash_sale",
        p_amount: 15_000,
        p_payment_status: "paid",
        p_description: e2eName("Penjualan tanpa stok"),
        p_cash_account_id: cashAcctId,
        p_product_id: product.id,
        p_quantity: 1,
        p_unit_price: 15_000,
        p_client_token: crypto.randomUUID(),
      });

      expect(status).not.toBe(200);
    });
  });

  // ── Inactive product cannot be sold ───────────────────────────────────

  test.describe("Inactive product cannot be sold", () => {
    let inactiveProduct: Awaited<ReturnType<typeof createE2EProduct>>;

    test.beforeAll(async () => {
      inactiveProduct = await createE2EProduct(orgId, {
        code: `E2E-INACT-${Date.now()}`,
        name: e2eName("Produk Nonaktif"),
        purchasePrice: 20_000,
        sellingPrice: 30_000,
      });

      // Deactivate via service role
      await fetch(
        `${E2E.supabaseUrl}/rest/v1/products?id=eq.${inactiveProduct.id}`,
        {
          method: "PATCH",
          headers: SR_HEADERS,
          body: JSON.stringify({ is_active: false }),
        },
      );
    });

    test("cash sale with inactive product is rejected", async () => {
      const { status } = await rpc(ownerToken, "post_transaction", {
        p_organization_id: orgId,
        p_transaction_date: new Date().toISOString().split("T")[0],
        p_transaction_type: "cash_sale",
        p_amount: 30_000,
        p_payment_status: "paid",
        p_description: e2eName("Penjualan produk nonaktif"),
        p_cash_account_id: cashAcctId,
        p_product_id: inactiveProduct.id,
        p_quantity: 1,
        p_unit_price: 30_000,
        p_client_token: crypto.randomUUID(),
      });

      expect(status).not.toBe(200);
    });

    test("cash purchase with inactive product is rejected", async () => {
      const { status } = await rpc(ownerToken, "post_transaction", {
        p_organization_id: orgId,
        p_transaction_date: new Date().toISOString().split("T")[0],
        p_transaction_type: "cash_purchase",
        p_amount: 20_000,
        p_payment_status: "paid",
        p_description: e2eName("Pembelian produk nonaktif"),
        p_cash_account_id: cashAcctId,
        p_product_id: inactiveProduct.id,
        p_quantity: 1,
        p_unit_price: 20_000,
        p_client_token: crypto.randomUUID(),
      });

      expect(status).not.toBe(200);
    });
  });
});
