import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
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

const listProductsPage = vi.fn();
const createProduct = vi.fn();
const patchProduct = vi.fn();
const getProductMovements = vi.fn();
vi.mock('@/lib/api/products', () => ({
  listProductsPage: (...args: unknown[]) => listProductsPage(...args),
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

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe('ProductsPage expandable rows', () => {
  beforeEach(() => {
    listProductsPage.mockResolvedValue({ products: [product], total: 1 });
  });

  it('tombol aksi ringkas berlabel aksesibel (ikon di mobile)', async () => {
    listProductsPage.mockResolvedValue({ products: [product], total: 1 });
    getProductMovements.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    // Nama aksesibel tetap menyebut produk; teks visual hanya di sm+.
    expect(screen.getByRole('button', { name: 'Edit Kopi' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nonaktifkan Kopi' })).toBeTruthy();
  });

  it('info HPP/Jual pindah ke panel expand (baris ringkas)', async () => {
    listProductsPage.mockResolvedValue({ products: [{ ...product, average_cost_idr: 30000, selling_price_idr: 50000 }], total: 1 });
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
    listProductsPage.mockResolvedValue({ products: [product], total: 1 });
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
    listProductsPage.mockResolvedValue({ products: [product], total: 1 });
    getProductMovements.mockResolvedValue(movements);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    expect(screen.queryByText('TRX-20260610-AAAA')).toBeNull();
    fireEvent.click(screen.getByText('Kopi'));
    expect(await screen.findByText('TRX-20260610-AAAA')).toBeTruthy();
  });

  it('menampilkan pesan kosong bila produk belum ada mutasi', async () => {
    listProductsPage.mockResolvedValue({ products: [product], total: 1 });
    getProductMovements.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Kopi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /riwayat mutasi kopi/i }));
    expect(await screen.findByText(/belum ada mutasi/i)).toBeTruthy();
  });
});

describe('ProductsPage cari/filter/sort/paginasi/tambah', () => {
  it('chip filter dalam strip scroll horizontal di mobile', async () => {
    renderPage();
    expect(await screen.findByText('Kopi')).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Filter produk' });
    expect(group.className).toContain('overflow-x-auto');
    expect(group.className).toContain('flex-nowrap');
  });

  beforeEach(() => {
    listProductsPage.mockResolvedValue({ products: [product], total: 1 });
  });

  it('memuat semua status secara default (termasuk nonaktif)', async () => {
    renderPage();
    expect(await screen.findByText('Kopi')).toBeTruthy();
    expect(listProductsPage).toHaveBeenCalledWith(expect.objectContaining({ status: 'all' }));
  });

  function renderList() {
    return renderPage();
  }

  it('pencarian memfilter daftar', async () => {
    renderList();
    expect(await screen.findByText('Kopi')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/cari produk/i), { target: { value: 'kopi' } });
    await waitFor(() => {
      expect(listProductsPage).toHaveBeenCalledWith(expect.objectContaining({ search: 'kopi' }));
    });
  });

  it('chip Habis dan Menipis memfilter stok', async () => {
    renderList();
    expect(await screen.findByText('Kopi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Habis' }));
    await waitFor(() => {
      expect(listProductsPage).toHaveBeenCalledWith(expect.objectContaining({ stock: 'out' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Menipis' }));
    await waitFor(() => {
      expect(listProductsPage).toHaveBeenCalledWith(expect.objectContaining({ stock: 'low' }));
    });
  });

  it('paginasi tampil saat total melebihi halaman dan Berikutnya menambah offset', async () => {
    listProductsPage.mockResolvedValue({ products: [product], total: 30 });
    renderList();
    expect(await screen.findByText(/Halaman 1 dari 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    await waitFor(() => {
      expect(listProductsPage).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 }));
    });
  });

  it('tambah produk lewat modal', async () => {
    createProduct.mockResolvedValue({ ...product, name: 'Kopi Baru' });
    window.HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    renderList();
    expect(await screen.findByText('Kopi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Tambah Produk$/ }));
    fireEvent.change(await screen.findByLabelText('Nama Produk'), { target: { value: 'Kopi Baru' } });
    fireEvent.change(screen.getByLabelText('Satuan'), { target: { value: 'pcs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Produk' }));
    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kopi Baru', unit: 'pcs' }),
      );
    });
  });

  it('urutkan memanggil dengan sort yang dipilih', async () => {
    renderList();
    expect(await screen.findByText('Kopi')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/urutkan/i), { target: { value: 'stock_asc' } });
    await waitFor(() => {
      expect(listProductsPage).toHaveBeenCalledWith(expect.objectContaining({ sort: 'stock_asc' }));
    });
  });
});
