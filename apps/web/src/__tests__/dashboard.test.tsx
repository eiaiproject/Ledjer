import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { DashboardPage } from '@/pages/dashboard';
import { renderWithProviders } from './test-utils';

vi.mock('@/contexts/auth-context', async () => {
  const { authStub } = await import('./test-utils');
  return { useAuth: () => authStub };
});

vi.mock('@/hooks/useOrganization', async () => {
  const { orgStub } = await import('./test-utils');
  return { useOrganization: () => orgStub };
});

const getDashboardSummary = vi.fn();
const getDashboardAlerts = vi.fn();
vi.mock('@/lib/api/dashboard', () => ({
  getDashboardSummary: (...args: unknown[]) => getDashboardSummary(...args),
  getDashboardAlerts: (...args: unknown[]) => getDashboardAlerts(...args),
}));

function renderDashboard() {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>,
    '/dashboard',
  );
}

describe('DashboardPage', () => {
  it('kartu statistik tertaut ke halaman detail dan rincian kas dihapus', async () => {
    getDashboardSummary.mockResolvedValue({
      cashBankBalance: 1000000,
      cashBankAccounts: [{ id: 'a1', code: '1110', name: 'Kas', balance: 1000000 }],
      month: { from: '2026-09-01', to: '2026-09-30' },
      moneyIn: 500000,
      moneyOut: 200000,
      netIncome: 300000,
      recentTransactions: [],
    });
    getDashboardAlerts.mockResolvedValue({ negativeBalanceAccounts: [] });

    renderDashboard();

    expect(await screen.findByText(/belum ada transaksi/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /saldo kas & bank/i })).toHaveAttribute('href', '/accounts');
    expect(screen.getByRole('link', { name: /uang masuk bulan ini/i })).toHaveAttribute(
      'href',
      '/transactions?type=cash_in',
    );
    expect(screen.getByRole('link', { name: /uang keluar bulan ini/i })).toHaveAttribute(
      'href',
      '/transactions?type=cash_out',
    );
    expect(screen.getByRole('link', { name: /laba bersih bulan ini/i })).toHaveAttribute(
      'href',
      '/reports/profit-loss',
    );
    expect(screen.queryByText(/rincian kas & bank/i)).toBeNull();
  });

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