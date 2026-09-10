import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen, within, fireEvent } from '@testing-library/react';
import { ProductsPage } from '@/pages/products/index';
import { renderWithProviders } from './test-utils';

vi.mock('@/contexts/auth-context', async () => {
  const { authStub } = await import('./test-utils');
  return { useAuth: () => authStub };
});

vi.mock('@/hooks/useOrganization', async () => {
  const { orgStub } = await import('./test-utils');
  return { useOrganization: () => orgStub };
});

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
  return renderWithProviders(
    <Routes>
      <Route path="/products" element={<ProductsPage />} />
    </Routes>,
    '/products',
  );
}

describe('ProductsPage expandable rows', () => {
  it('tombol aksi ringkas berlabel aksesibel (ikon di mobile)', async () => {
    listProducts.mockResolvedValue([product]);
    getProductMovements.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    // Nama aksesibel tetap menyebut produk; teks visual hanya di sm+.
    expect(screen.getByRole('button', { name: 'Edit Kopi' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nonaktifkan Kopi' })).toBeTruthy();
  });

  it('info HPP/Jual pindah ke panel expand (baris ringkas)', async () => {
    listProducts.mockResolvedValue([{ ...product, average_cost_idr: 30000, selling_price_idr: 50000 }]);
    getProductMovements.mockResolvedValue(movements);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    // Baris ringkas: tidak ada teks HPP di daftar (form tambah diabaikan).
    const list = screen.getByRole('list');
    expect(within(list).queryByText(/HPP/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /riwayat mutasi kopi/i }));
    expect(await within(list).findByText(/HPP/)).toBeTruthy();
  });

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

  it('ketuk area nama produk juga mengembangkan riwayat', async () => {
    listProducts.mockResolvedValue([product]);
    getProductMovements.mockResolvedValue(movements);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    expect(screen.queryByText('TRX-20260610-AAAA')).toBeNull();
    fireEvent.click(screen.getByText('Kopi'));
    expect(await screen.findByText('TRX-20260610-AAAA')).toBeTruthy();
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
