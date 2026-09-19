import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Stub bersama untuk mock auth-context / useBook di test halaman.
 * Dipakai via dynamic import di dalam factory vi.mock (async) agar lolos
 * hoisting — JANGAN diimport statis ke dalam factory vi.mock.
 */
export const authStub = {
  session: { id: "s1", user_id: "u1", expires_at: 0 },
  user: { id: "u1", email: "a@b.c", full_name: "A", business_name: "Buku A" },
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
};

export const bookStub = {
  userId: "u1",
  businessName: "Buku A",
  ready: true,
};

/** Render dengan QueryClient (tanpa retry) + MemoryRouter + ToastProvider nyata. */
export function renderWithProviders(routes: ReactNode, initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ToastProvider>{routes}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
