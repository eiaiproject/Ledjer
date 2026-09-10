import { apiRequest } from "./client";
import type { StockMovementReportLine } from "../../../worker/services/report-types";

export type { StockMovementReportLine } from "../../../worker/services/report-types";

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

interface ProductMovementsResponse {
  movements: StockMovementReportLine[];
}

export function getProductMovements(
  productId: string,
  fromDate?: string,
  toDate?: string,
): Promise<StockMovementReportLine[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const query = params.size > 0 ? `?${params}` : "";
  return apiRequest<ProductMovementsResponse>(`/api/products/${productId}/movements${query}`).then(
    (data) => data.movements,
  );
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