import { apiRequest } from "./client";

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  current_stock: number;
  min_stock: number;
  unit: string;
  purchase_price: number;
  selling_price: number;
  is_active: boolean;
}

export interface ProductInput {
  code: string;
  name: string;
  description: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  minStock: number;
}

export interface ProductPatch {
  code?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  sellingPrice?: number;
  minStock?: number;
  isActive?: boolean;
}

interface ProductsResponse {
  products: Product[];
}

interface ProductResponse {
  product: Product;
}

export function listProducts(): Promise<Product[]> {
  return apiRequest<ProductsResponse>("/api/products").then((data) => data.products);
}

export function createProduct(input: ProductInput): Promise<Product> {
  return apiRequest<ProductResponse>("/api/products", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((data) => data.product);
}

export function updateProduct(
  productId: string,
  input: ProductPatch,
): Promise<Product> {
  return apiRequest<ProductResponse>(`/api/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((data) => data.product);
}

export function deactivateProduct(productId: string): Promise<Product> {
  return apiRequest<ProductResponse>(`/api/products/${productId}`, {
    method: "DELETE",
  }).then((data) => data.product);
}

export interface StockAdjustmentInput {
  productId: string;
  quantity: number;
  reason: string;
  movementDate?: string;
}

export interface StockCountInput {
  productId: string;
  physicalStock: number;
  notes?: string;
}

export interface StockCountResult {
  productId: string;
  productName: string;
  systemStock: string;
  physicalStock: string;
  difference: string;
  movement: unknown;
}

export interface StockAdjustmentResult {
  movement: {
    id: string;
    /** True when the paired journal entry was posted. */
    journal_posted: boolean;
    journal_skip_reason?: string;
  };
}

export function adjustStock(input: StockAdjustmentInput): Promise<StockAdjustmentResult> {
  return apiRequest<StockAdjustmentResult>("/api/inventory/adjust", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function recordStockCount(input: StockCountInput): Promise<StockCountResult> {
  return apiRequest<StockCountResult>("/api/inventory/stock-count", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Fetch stock movements for a specific product. */
export function listStockMovements(productId?: string): Promise<{ movements: unknown[] }> {
  const params = productId ? `?productId=${encodeURIComponent(productId)}` : "";
  return apiRequest(`/api/inventory/movements${params}`);
}
