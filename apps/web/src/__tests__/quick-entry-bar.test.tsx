import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickEntryBar } from '@/components/transactions/QuickEntryBar';
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
vi.mock('@/lib/api/products', () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
}));

const listCashBankAccounts = vi.fn();
const listAccounts = vi.fn();
vi.mock('@/lib/api/accounts', () => ({
  listCashBankAccounts: (...args: unknown[]) => listCashBankAccounts(...args),
  listAccounts: (...args: unknown[]) => listAccounts(...args),
}));

const postTransaction = vi.fn();
vi.mock('@/lib/api/transactions', () => ({
  postTransaction: (...args: unknown[]) => postTransaction(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const product = {
  id: 'p-kopi',
  code: 'PRD-0001',
  name: 'Kopi',
  unit: 'pcs',
  selling_price_idr: 50000,
  current_stock: 14,
  average_cost_idr: 30000,
  stock_value_idr: 420000,
  is_active: 1,
  created_at: 0,
  updated_at: 0,
};

function renderBar() {
  return renderWithProviders(
    <Routes>
      <Route path="/transactions" element={<QuickEntryBar />} />
    </Routes>,
    '/transactions',
  );
}

function seedCatalog() {
  listProducts.mockResolvedValue([product]);
  listCashBankAccounts.mockResolvedValue([{ id: 'kas-1', name: 'Kas' }]);
  listAccounts.mockResolvedValue([
    { id: 'rev-1', name: 'Pendapatan', account_class: 'income', is_active: 1 },
  ]);
}

async function readyToSend() {
  const kirim = screen.getByRole('button', { name: /kirim/i });
  await waitFor(() => expect(kirim).toBeEnabled());
  return kirim;
}

describe('QuickEntryBar', () => {
  it('tombol Kirim menunjukkan loading saat katalog dimuat', async () => {
    listProducts.mockImplementation(() => new Promise(() => {}));
    listCashBankAccounts.mockResolvedValue([]);
    listAccounts.mockResolvedValue([]);
    renderBar();

    expect(screen.getByRole('button', { name: /kirim/i })).toHaveAttribute('aria-busy', 'true');
  });

  it('ketik jual → pratinjau tampil dengan tombol Catat', async () => {
    seedCatalog();
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'jual kopi 10pcs 50000' } });
    fireEvent.click(kirim);

    // Satuan Rp 50.000 (@...) dan total Rp 500.000 (=...).
    expect(await screen.findAllByText(/Rp 50\.000/)).toHaveLength(1);
    expect(screen.getAllByText(/Rp 500\.000/)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Catat$/ })).toBeEnabled();
  });

  it('stok kurang mematikan tombol Catat', async () => {
    seedCatalog();
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'jual kopi 99pcs 50000' } });
    fireEvent.click(kirim);

    expect(await screen.findByText(/Stok tidak cukup/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Catat$/ })).toBeDisabled();
  });

  it('konfirmasi memanggil postTransaction bentuk sale', async () => {
    seedCatalog();
    postTransaction.mockResolvedValue({ transaction_id: 't-1', transaction_number: 'TRX-X', status: 'posted' });
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'jual kopi 10pcs 50000' } });
    fireEvent.click(kirim);
    const catat = await screen.findByRole('button', { name: /^Catat$/ });
    fireEvent.click(catat);

    await screen.findByText(/tercatat/i);
    expect(postTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'cash_in',
        counterAccountId: 'rev-1',
        amountIdr: 500000,
        items: [{ productId: 'p-kopi', quantity: 10, unitPriceIdr: 50000 }],
      }),
    );
  });
});
