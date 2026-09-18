import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { fireEvent, screen } from '@testing-library/react';
import { TransactionListPage } from '@/pages/transactions/index';
import { renderWithProviders } from './test-utils';

vi.mock('@/contexts/auth-context', async () => {
  const { authStub } = await import('./test-utils');
  return { useAuth: () => authStub };
});

vi.mock('@/hooks/useBook', async () => {
  const { bookStub } = await import('./test-utils');
  return { useBook: () => bookStub };
});

const listTransactions = vi.fn();
vi.mock('@/lib/api/transactions', () => ({
  listTransactions: (...args: unknown[]) => listTransactions(...args),
}));

vi.mock('@/lib/api/exports', () => ({
  downloadTransactionsCsv: vi.fn(),
}));

function renderList(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/transactions" element={<TransactionListPage />} />
    </Routes>,
    path,
  );
}

function seedEmpty() {
  listTransactions.mockResolvedValue({ transactions: [], total: 0 });
}

describe('TransactionListPage filters', () => {
  it('filter tertutup default, terbuka setelah toggle', async () => {
    seedEmpty();
    renderList('/transactions');

    expect(await screen.findByText(/tidak ada transaksi/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^Cari$/)).toBeNull();

    const toggle = screen.getByRole('button', { name: /filter.*cari/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/^Cari$/)).toBeTruthy();
  });

  it('otomatis terbuka bila ada filter tanggal di URL', async () => {
    seedEmpty();
    renderList('/transactions?fromDate=2026-09-01&toDate=2026-09-30');

    expect(await screen.findByLabelText(/^Cari$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /2 aktif/i })).toBeTruthy();
  });
});
