import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from '@/pages/dashboard';

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

const getDashboardSummary = vi.fn();
const getDashboardAlerts = vi.fn();
vi.mock('@/lib/api/dashboard', () => ({
  getDashboardSummary: (...args: unknown[]) => getDashboardSummary(...args),
  getDashboardAlerts: (...args: unknown[]) => getDashboardAlerts(...args),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  it('renders without crashing when summary is missing recentTransactions', async () => {
    getDashboardSummary.mockResolvedValue({
      cashBankBalance: 0,
      cashBankAccounts: [],
      month: { from: '2026-09-01', to: '2026-09-30' },
      moneyIn: 0,
      moneyOut: 0,
      netIncome: 0,
      // recentTransactions intentionally absent (stale worker shape)
    });
    getDashboardAlerts.mockResolvedValue({ negativeBalanceAccounts: [] });

    renderDashboard();

    // The empty state renders instead of crashing.
    expect(await screen.findByText(/belum ada transaksi/i)).toBeTruthy();
    expect(screen.queryByText(/Rincian Kas & Bank/i)).toBeNull();
  });

  it('renders without crashing when summary and alerts are missing all array fields', async () => {
    getDashboardSummary.mockResolvedValue({
      cashBankBalance: 0,
      month: { from: '2026-09-01', to: '2026-09-30' },
      moneyIn: 0,
      moneyOut: 0,
      netIncome: 0,
    });
    getDashboardAlerts.mockResolvedValue({});

    renderDashboard();

    expect(await screen.findByText(/belum ada transaksi/i)).toBeTruthy();
  });
});