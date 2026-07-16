import { QueryClient } from "@tanstack/react-query";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Retry on server errors (>=500) or network failures (TypeError/code=network_error)
        // Do NOT retry on client errors (4xx) — they're the caller's fault
        if (isApiError(error)) {
          if (error.status >= 500) return failureCount < 2;
          return false;
        }
        if (error instanceof TypeError) return failureCount < 2;
        return false;
      },
      retryDelay: (attempt) => [500, 1500][attempt - 1] ?? 1500,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        toast.error(translateError(error));
      },
    },
  },
});