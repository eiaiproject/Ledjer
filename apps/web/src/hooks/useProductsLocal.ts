/**
 * useProductsLocal — React Query hooks for local SQLite products.
 * Offline-first mirror of api/products listProductsPage/listProducts.
 */

import { useQuery } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import { useLocalDb } from "@/lib/db/provider";
import { getAllProducts, getProductById } from "@/lib/db/repos";
import type { Product } from "@/lib/accounting/types";

/** All products for current book (local). */
export function useProductsLocal() {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery<Product[]>({
    queryKey: ["products-local", userId],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      return getAllProducts(db, userId);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}

/** Single product by id (local). */
export function useProductLocal(productId: string | undefined) {
  const { ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null && !!productId;

  return useQuery<Product | null>({
    queryKey: ["product-local", productId],
    queryFn: () => {
      if (!db || !productId) throw new Error("Local DB not ready");
      return getProductById(db, productId);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}
