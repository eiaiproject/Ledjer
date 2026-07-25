import { apiRequest } from "./client";

export interface SearchResultItem {
  entityType: "transaction" | "invoice" | "party" | "product" | "account" | "member";
  entityId: string;
  label: string;
  subtitle: string;
  url: string;
  score: number;
}

export interface GlobalSearchResult {
  query: string;
  results: SearchResultItem[];
  total: number;
}

/**
 * Global search across all entities within the current organization.
 * Requires at least 2 characters. Tenant-scoped server-side.
 */
export function globalSearch(query: string, limit = 10): Promise<GlobalSearchResult> {
  return apiRequest<GlobalSearchResult>(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}
