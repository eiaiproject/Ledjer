import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from '@/layouts/dashboard';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    session: { id: 's1', user_id: 'u1', expires_at: 0, current_organization_id: 'o1' },
    user: { id: 'u1', email: 'a@b.c', full_name: 'A' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    data: {
      organization: { id: 'o1', name: 'Org A', base_currency: 'IDR', status: 'active', created_at: 0 },
      member: { id: 'm1', organization_id: 'o1', user_id: 'u1', role: 'owner', status: 'active' },
    },
  }),
}));

function renderLayoutAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>dash</div>} />
            <Route path="/transactions/:id" element={<div>detail</div>} />
            <Route path="/settings" element={<div>settings</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function bottomNav() {
  return screen.getByRole('navigation', { name: 'Navigasi mobile' });
}

describe('DashboardLayout bottom nav (distill: 5 slot)', () => {
  it('hanya menampilkan 4 tab harian + Lainnya (tanpa Pengaturan)', () => {
    renderLayoutAt('/dashboard');
    const nav = bottomNav();
    expect(within(nav).getByRole('link', { name: /beranda/i })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /transaksi/i })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /kas & bank/i })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /produk/i })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: /pengaturan/i })).toBeNull();
    expect(within(nav).getByRole('button', { name: /lainnya/i })).toBeTruthy();
  });

  it('Lainnya aktif saat berada di rute yang hanya ada di drawer (mis. Pengaturan)', () => {
    renderLayoutAt('/settings');
    const nav = bottomNav();
    expect(within(nav).getByRole('button', { name: /lainnya/i }).getAttribute('aria-current')).toBe('page');
  });

  it('tab Transaksi tetap aktif di halaman detail (/transactions/:id)', () => {
    renderLayoutAt('/transactions/abc-123');
    const nav = bottomNav();
    expect(within(nav).getByRole('link', { name: /transaksi/i }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('button', { name: /lainnya/i }).getAttribute('aria-current')).toBeNull();
  });
});
