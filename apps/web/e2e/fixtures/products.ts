import { E2E, e2eName } from "./env";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

export interface TestProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
}

/**
 * Create an E2E test product via Supabase REST.
 */
export async function createE2EProduct(
  orgId: string,
  opts: Partial<{
    code: string;
    name: string;
    unit: string;
    purchasePrice: number;
    sellingPrice: number;
  }> = {},
): Promise<TestProduct> {
  const code = opts.code || `E2E-${Date.now()}`;
  const name = opts.name || e2eName("Produk Test");
  const unit = opts.unit || "pcs";

  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/products`, {
    method: "POST",
    headers: { ...SR_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      code,
      name,
      unit,
      purchase_price: opts.purchasePrice ?? 10000,
      selling_price: opts.sellingPrice ?? 15000,
      current_stock: 0,
      is_active: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create product: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data[0];
}

/**
 * Fetch all active products for an org.
 */
export async function getOrgProducts(orgId: string): Promise<TestProduct[]> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/products?organization_id=eq.${orgId}&is_active=eq.true&select=*&order=name`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
  return res.json();
}

/**
 * Delete E2E products for an org.
 */
export async function cleanupE2EProducts(orgId: string): Promise<void> {
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/products?organization_id=eq.${orgId}&name=like.[E2E]*`,
    { method: "DELETE", headers: SR_HEADERS },
  ).catch(() => {});
}
