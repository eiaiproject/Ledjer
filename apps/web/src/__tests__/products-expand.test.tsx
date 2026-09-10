import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductsPage } from '@/pages/products/index';

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

const listProducts = vi.fn();
const createProduct = vi.fn();
const patchProduct = vi.fn();
const getProductMovements = vi.fn();
vi.mock('@/lib/api/products', () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
  createProduct: (...args: unknown[]) => createProduct(...args),
  patchProduct: (...args: unknown[]) => patchProduct(...args),
  getProductMovements: (...args: unknown[]) => getProductMovements(...args),
}));

const product = {
  id: 'p-kopi',
  code: 'PRD-0001',
  name: 'Kopi',
  unit: 'pcs',
  selling_price_idr: 50000,
  current_stock: 6,
  average_cost_idr: 30000,
  stock_value_idr: 180000,
  is_active: 1,
};

const movements = [
  {
    product_id: 'p-kopi',
    product_name: 'Kopi',
    unit: 'pcs',
    entry_date: '2026-06-10',
    transaction_id: 't-1',
    transaction_number: 'TRX-20260610-AAAA',
    transaction_type: 'purchase',
    description: 'Beli kopi',
    quantity_in_milli: 10000,
    quantity_out_milli: 0,
    unit_cost_minor: 30000 * 10000,
    running_stock_milli: 10000,
  },
  {
    product_id: 'p-kopi',
    product_name: 'Kopi',
    unit: 'pcs',
    entry_date: '2026-06-15',
    transaction_id: 't-2',
    transaction_number: 'TRX-20260615-BBBB',
    transaction_type: 'cash_in',
    description: 'Jual kopi',
    quantity_in_milli: 0,
    quantity_out_milli: 4000,
    unit_cost_minor: 30000 * 10000,
    running_stock_milli: 6000,
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/products']}>
        <Routes>
          <Route path="/products" element={<ProductsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProductsPage expandable rows', () => {
  it('mengembangkan baris produk untuk menampilkan riwayat mutasi', async () => {
    listProducts.mockResolvedValue([product]);
    getProductMovements.mockResolvedValue(movements);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    expect(screen.queryByText('TRX-20260610-AAAA')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /riwayat mutasi kopi/i }));
    expect(await screen.findByText('TRX-20260610-AAAA')).toBeTruthy();
    expect(screen.getByText('TRX-20260615-BBBB')).toBeTruthy();
    expect(getProductMovements).toHaveBeenCalledWith('p-kopi');
  });

  it('menampilkan pesan kosong bila produk belum ada mutasi', async () => {
    listProducts.mockResolvedValue([product]);
    getProductMovements.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /riwayat mutasi kopi/i }));
    expect(await screen.findByText(/belum ada mutasi/i)).toBeTruthy();
  });
});
