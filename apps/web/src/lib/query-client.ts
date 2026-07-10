import { QueryClient } from "@tanstack/react-query";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast";

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
        toast.error(translateError(error));
      },
    },
  },
});