import { apiRequest } from "./client";

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  selling_price_idr: number;
  /** Stok dalam satuan produk (desimal, maks 3 desimal). */
  current_stock: number;
  /** Harga pokok rata-rata per satuan (desimal, maks 4 desimal). */
  average_cost_idr: number;
  stock_value_idr: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface ProductsResponse {
  products: Product[];
}

interface ProductResponse {
  product: Product;
}

export function listProducts(includeInactive = false): Promise<Product[]> {
  const query = includeInactive ? "?includeInactive=true" : "";
  return apiRequest<ProductsResponse>(`/api/products${query}`).then((data) => data.products);
}

export function createProduct(input: {
  code?: string;
  name: string;
  unit: string;
  sellingPriceIdr: number;
}): Promise<Product> {
  return apiRequest<ProductResponse>("/api/products", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((data) => data.product);
}

export function patchProduct(
  productId: string,
  input: { name?: string; unit?: string; sellingPriceIdr?: number; isActive?: boolean },
): Promise<Product> {
  return apiRequest<ProductResponse>(`/api/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((data) => data.product);
}