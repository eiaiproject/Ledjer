import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

/**
 * Stub bersama untuk mock auth-context / useOrganization di test halaman.
 * Dipakai via dynamic import di dalam factory vi.mock (async) agar lolos
 * hoisting — JANGAN diimport statis ke dalam factory vi.mock.
 */
export const authStub = {
  session: { id: "s1", user_id: "u1", expires_at: 0, current_organization_id: "o1" },
  user: { id: "u1", email: "a@b.c", full_name: "A" },
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

export const orgStub = {
  data: {
    organization: { id: "o1", name: "Org A", base_currency: "IDR", status: "active", created_at: 0 },
    member: { id: "m1", organization_id: "o1", user_id: "u1", role: "owner", status: "active" },
  },
};

/** Render dengan QueryClient (tanpa retry) + MemoryRouter. */
export function renderWithProviders(routes: ReactNode, initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>{routes}</MemoryRouter>
    </QueryClientProvider>,
  );
}
