import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickEntryBar } from '@/components/transactions/QuickEntryBar';
import { renderWithProviders } from './test-utils';

vi.mock('@/contexts/auth-context', async () => {
  const { authStub } = await import('./test-utils');
  return { useAuth: () => authStub };
});

vi.mock('@/hooks/useBook', async () => {
  const { bookStub } = await import('./test-utils');
  return { useBook: () => bookStub };
});
vi.mock('@/lib/db/provider', () => ({
  useLocalDb: () => null,
}));

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

    // Nominal polos dibaca sebagai total Rp 50.000, satuan diturunkan Rp 5.000.
    expect(await screen.findAllByText(/Rp 5\.000/)).toHaveLength(1);
    expect(screen.getAllByText(/Rp 50\.000/)).toHaveLength(1);
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

    // Pesan inline + toast provider sungguhan (2 kemunculan).
    expect(await screen.findAllByText(/tercatat/i)).toHaveLength(2);
    expect(postTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'cash_in',
        counterAccountId: 'rev-1',
        amountIdr: 50000,
        items: [{ productId: 'p-kopi', quantity: 10, unitPriceIdr: 5000 }],
      }),
    );
  });

  it('panduan tertutup default, terbuka setelah tombol diklik', async () => {
    seedCatalog();
    renderBar();
    await readyToSend();

    expect(screen.queryByText('jual kopi 10 butir 50rb')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /contoh dan cara pakai/i }));
    expect(await screen.findByText('jual kopi 10 butir 50rb')).toBeTruthy();
    expect(screen.getByRole('button', { name: /sembunyikan/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('ketuk contoh mengisi input dan menutup panduan', async () => {
    seedCatalog();
    renderBar();
    await readyToSend();

    fireEvent.click(screen.getByRole('button', { name: /contoh dan cara pakai/i }));
    fireEvent.click(await screen.findByText('bayar sewa 500rb'));

    expect((screen.getByLabelText(/cepat/i) as HTMLInputElement).value).toBe('bayar sewa 500rb');
    expect(screen.queryByText('jual kopi 10 butir 50rb')).toBeNull();
  });

  it('setor modal mengirim counter Modal 3110', async () => {
    seedCatalog();
    listAccounts.mockResolvedValue([
      { id: 'rev-1', name: 'Pendapatan', code: '4110', account_class: 'income', is_active: 1 },
      { id: 'eq-3110', name: 'Modal Pemilik', code: '3110', account_class: 'equity', is_active: 1 },
      { id: 'eq-3120', name: 'Pengambilan Pemilik', code: '3120', account_class: 'equity', is_active: 1 },
    ]);
    postTransaction.mockResolvedValue({ transaction_id: 't-3', transaction_number: 'TRX-Z', status: 'posted' });
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'setor modal awal 1jt' } });
    fireEvent.click(kirim);
    const catat = await screen.findByRole('button', { name: /^Catat$/ });
    fireEvent.click(catat);

    expect(await screen.findAllByText(/tercatat/i)).toHaveLength(2);
    expect(postTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: 'owner_deposit', counterAccountId: 'eq-3110', amountIdr: 1000000 }),
    );
  });

  it('ambil prive mengirim counter 3120', async () => {
    seedCatalog();
    listAccounts.mockResolvedValue([
      { id: 'rev-1', name: 'Pendapatan', code: '4110', account_class: 'income', is_active: 1 },
      { id: 'eq-3110', name: 'Modal Pemilik', code: '3110', account_class: 'equity', is_active: 1 },
      { id: 'eq-3120', name: 'Pengambilan Pemilik', code: '3120', account_class: 'equity', is_active: 1 },
    ]);
    postTransaction.mockResolvedValue({ transaction_id: 't-4', transaction_number: 'TRX-W', status: 'posted' });
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'ambil prive 300rb' } });
    fireEvent.click(kirim);
    const catat = await screen.findByRole('button', { name: /^Catat$/ });
    fireEvent.click(catat);

    expect(await screen.findAllByText(/tercatat/i)).toHaveLength(2);
    expect(postTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: 'owner_withdrawal', counterAccountId: 'eq-3120', amountIdr: 300000 }),
    );
  });

  it('tombol Catat mati bila kas tidak cukup', async () => {
    seedCatalog();
    listCashBankAccounts.mockResolvedValue([{ id: 'kas-1', name: 'Kas', balance_idr: 1000000 }]);
    listAccounts.mockResolvedValue([
      { id: 'rev-1', name: 'Pendapatan', code: '4110', account_class: 'income', is_active: 1 },
    ]);
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'beli kopi 100 butir 40jt' } });
    fireEvent.click(kirim);

    expect(await screen.findByText(/Kas tidak cukup/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Catat$/ })).toBeDisabled();
  });

  it('tombol Catat mati bila akun ekuitas hilang', async () => {
    seedCatalog();
    listAccounts.mockResolvedValue([
      { id: 'rev-1', name: 'Pendapatan', code: '4110', account_class: 'income', is_active: 1 },
    ]);
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'setor modal awal 1jt' } });
    fireEvent.click(kirim);

    expect(await screen.findByText(/3110/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Catat$/ })).toBeDisabled();
  });

  it('bayar beban meminta kategori lalu memanggil cash_out', async () => {
    seedCatalog();
    listAccounts.mockResolvedValue([
      { id: 'rev-1', name: 'Pendapatan', account_class: 'income', is_active: 1 },
      { id: 'exp-1', name: 'Beban Lain-lain', account_class: 'expense', is_active: 1 },
    ]);
    postTransaction.mockResolvedValue({ transaction_id: 't-2', transaction_number: 'TRX-Y', status: 'posted' });
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'bayar stiker brand 16rb' } });
    fireEvent.click(kirim);
    const catat = await screen.findByRole('button', { name: /^Catat$/ });
    fireEvent.click(catat);

    expect(await screen.findAllByText(/tercatat/i)).toHaveLength(2);
    expect(postTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: 'cash_out', amountIdr: 16000 }),
    );
  });
});
