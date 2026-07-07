/**
 * Product helpers for E2E tests using Cloudflare Worker API.
 * No Supabase dependency — all product operations go through /api/products/*.
 */

import { E2E, e2eName } from "./env";

export interface TestProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
}

/**
 * Create an E2E test product via Worker API.
 */
export async function createE2EProduct(
  sessionToken: string,
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

  const res = await fetch(`${E2E.baseUrl}/api/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `ledjer_session=${sessionToken}`,
    },
    body: JSON.stringify({
      code,
      name,
      unit: opts.unit || "pcs",
      purchasePrice: opts.purchasePrice ?? 10000,
      sellingPrice: opts.sellingPrice ?? 15000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create product: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    id: data.productId || data.id,
    code,
    name,
    unit: opts.unit || "pcs",
    purchasePrice: opts.purchasePrice ?? 10000,
    sellingPrice: opts.sellingPrice ?? 15000,
    currentStock: 0,
  };
}

/**
 * Fetch all active products for an org via Worker API.
 */
export async function getOrgProducts(sessionToken: string): Promise<TestProduct[]> {
  const res = await fetch(`${E2E.baseUrl}/api/products`, {
    headers: { Cookie: `ledjer_session=${sessionToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
  const data = await res.json();
  return data.products || data || [];
}
