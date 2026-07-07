import { apiRequest, jsonBody } from "./client";

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
    body: jsonBody(input),
  }).then((data) => data.product);
}

export function updateProduct(
  productId: string,
  input: ProductPatch,
): Promise<Product> {
  return apiRequest<ProductResponse>(`/api/products/${productId}`, {
    method: "PATCH",
    body: jsonBody(input),
  }).then((data) => data.product);
}

export function deactivateProduct(productId: string): Promise<Product> {
  return apiRequest<ProductResponse>(`/api/products/${productId}`, {
    method: "DELETE",
  }).then((data) => data.product);
}
