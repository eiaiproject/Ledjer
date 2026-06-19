import { QueryClient } from "@tanstack/react-query";
import { translateError } from "@/lib/errors";

// Global toast function — set by the app after provider mounts
let globalToastFn: ((message: string, variant: "error" | "success" | "warning" | "info") => void) | null = null;

export function setGlobalToast(fn: typeof globalToastFn) {
  globalToastFn = fn;
}

function showToast(message: string, variant: "error" | "success" | "warning" | "info") {
  if (globalToastFn) {
    globalToastFn(message, variant);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Don't retry on auth errors or permission issues
        const message = error instanceof Error ? error.message : "";
        if (message.includes("JWT") || message.includes("permission")) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        const message = translateError(error);
        showToast(message, "error");
      },
    },
  },
});
