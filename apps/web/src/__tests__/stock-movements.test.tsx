import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockMovementsPage } from '@/pages/reports/stock-movements';
import type { StockMovementReport } from '@/lib/api/reports';

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

const getStockMovementReport = vi.fn();
const listProducts = vi.fn();
vi.mock('@/lib/api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/reports')>()),
  getStockMovementReport: (...args: unknown[]) => getStockMovementReport(...args),
}));
vi.mock('@/lib/api/products', () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/reports/stock-movements']}>
        <Routes>
          <Route path="/reports/stock-movements" element={<StockMovementsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseLine = {
  product_id: 'p-kopi',
  product_name: 'Kopi',
  unit: 'pcs',
  transaction_id: 't-1',
  transaction_number: 'TRX-20260610-AAAA',
  transaction_type: 'purchase',
  description: 'Beli kopi',
  unit_cost_minor: 30000 * 10000,
};

function reportWith(lines: StockMovementReport['lines']): StockMovementReport {
  return { fromDate: '2026-06-01', toDate: '2026-06-30', productId: null, lines };
}

describe('StockMovementsPage', () => {
  it('menampilkan grup produk dengan badge jenis dan sisa berjalan', async () => {
    listProducts.mockResolvedValue([{ id: 'p-kopi', name: 'Kopi' }]);
    getStockMovementReport.mockResolvedValue(
      reportWith([
        { ...baseLine, entry_date: '2026-06-10', quantity_in_milli: 10000, quantity_out_milli: 0, running_stock_milli: 10000 },
        {
          ...baseLine,
          transaction_id: 't-2',
          transaction_number: 'TRX-20260615-BBBB',
          transaction_type: 'cash_in',
          description: 'Jual kopi',
          entry_date: '2026-06-15',
          quantity_in_milli: 0,
          quantity_out_milli: 4000,
          running_stock_milli: 6000,
        },
      ]),
    );

    renderPage();

    expect(await screen.findByText('Kopi · pcs')).toBeTruthy();
    // Header kolom + badge baris: masing-masing muncul 2x.
    expect(screen.getAllByText('Masuk')).toHaveLength(2);
    expect(screen.getAllByText('Keluar')).toHaveLength(2);
    const table = screen.getByRole('table');
    // Masuk 10 + sisa 10 (baris beli), keluar 4, sisa 6 (baris jual).
    expect(within(table).getAllByText('10')).toHaveLength(2);
    expect(within(table).getByText('4')).toBeTruthy();
    expect(within(table).getByText('6')).toBeTruthy();
  });

  it('menampilkan empty state saat tidak ada mutasi', async () => {
    listProducts.mockResolvedValue([]);
    getStockMovementReport.mockResolvedValue(reportWith([]));

    renderPage();

    expect(await screen.findByText(/tidak ada mutasi/i)).toBeTruthy();
  });
});
