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
const createProduct = vi.fn();
vi.mock('@/lib/api/products', () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
  createProduct: (...args: unknown[]) => createProduct(...args),
}));

const listCashBankAccounts = vi.fn();
const listAccounts = vi.fn();
vi.mock('@/lib/api/accounts', () => ({
  listCashBankAccounts: (...args: unknown[]) => listCashBankAccounts(...args),
  listAccounts: (...args: unknown[]) => listAccounts(...args),
}));

const postTransaction = vi.fn();
const listTransactions = vi.fn();
vi.mock('@/lib/api/transactions', () => ({
  postTransaction: (...args: unknown[]) => postTransaction(...args),
  listTransactions: (...args: unknown[]) => listTransactions(...args),
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

  it('tombol Catat mati bila tanggal lebih tua dari catatan terakhir', async () => {
    seedCatalog();
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const yesterday = fmt(new Date(today.getTime() - 86400000));
    listTransactions.mockResolvedValue({ transactions: [{ transaction_date: fmt(today) }], total: 1 });
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'transfer 200rb' } });
    fireEvent.click(kirim);
    await screen.findByRole('button', { name: /^Catat$/ });
    fireEvent.change(screen.getByLabelText(/^Tanggal$/), { target: { value: yesterday } });

    expect(await screen.findByText(/Catatan terakhir/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Catat$/ })).toBeDisabled();
  });

  it('tanggal sama dengan catatan terakhir tetap bisa dicatat', async () => {
    seedCatalog();
    const today = new Date().toISOString().slice(0, 10);
    listTransactions.mockResolvedValue({ transactions: [{ transaction_date: today }], total: 1 });
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'transfer 200rb' } });
    fireEvent.click(kirim);

    expect(await screen.findByRole('button', { name: /^Catat$/ })).toBeEnabled();
  });

  it('beli tak dikenal menawarkan panel produk baru, bukan error', async () => {
    seedCatalog();
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'beli Kopi Baru 5 bungkus 50000' } });
    fireEvent.click(kirim);

    expect(await screen.findByText(/Produk baru: Kopi Baru/)).toBeTruthy();
    expect(screen.getByText(/akan dibuat/)).toBeTruthy();
    expect(createProduct).not.toHaveBeenCalled();
    expect(postTransaction).not.toHaveBeenCalled();
  });

  it('buat dan catat membuat produk lalu pembelian berurutan', async () => {
    seedCatalog();
    listCashBankAccounts.mockResolvedValue([{ id: 'kas-1', name: 'Kas', balance_idr: 1000000 }]);
    createProduct.mockResolvedValue({ id: 'p-baru', name: 'Kopi Baru' });
    postTransaction.mockResolvedValue({ transaction_id: 't-5', transaction_number: 'TRX-N', status: 'posted' });
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'beli Kopi Baru 5 bungkus 50000' } });
    fireEvent.click(kirim);
    await screen.findByText(/Produk baru: Kopi Baru/);

    fireEvent.click(screen.getByRole('button', { name: /buat.*catat/i }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Kopi Baru', unit: 'bungkus', sellingPriceIdr: 0 }),
    ));
    expect(postTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: 'purchase', amountIdr: 50000 }),
    );
    // Urutan: produk dulu, pembelian sesudahnya.
    expect(createProduct.mock.invocationCallOrder[0]).toBeLessThan(
      postTransaction.mock.invocationCallOrder[postTransaction.mock.invocationCallOrder.length - 1],
    );
    expect(await screen.findAllByText(/tercatat/i)).toHaveLength(2);
  });

  it('typo dekat menampilkan kandidat, bukan panel buat-baru', async () => {
    seedCatalog();
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'beli kopy 5pcs 50000' } });
    fireEvent.click(kirim);

    expect(await screen.findByRole('button', { name: /^Catat$/ })).toBeTruthy();
    expect(screen.queryByText(/Produk baru:/)).toBeNull();
  });

  it('ambigu pilih Stok produk tak dikenal masuk panel dengan satuan wajib isi', async () => {
    seedCatalog();
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'beli mika telur 34500' } });
    fireEvent.click(kirim);
    fireEvent.click(await screen.findByRole('button', { name: /^Stok$/ }));

    expect(await screen.findByText(/Produk baru: mika telur/)).toBeTruthy();
    // Satuan kosong → tombol mati.
    expect(screen.getByRole('button', { name: /buat.*catat/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Satuan$/), { target: { value: 'pcs' } });
    fireEvent.change(screen.getByLabelText(/^Jumlah$/), { target: { value: '10' } });
    expect(screen.getByRole('button', { name: /buat.*catat/i })).toBeEnabled();
  });

  it('gagal langkah pembelian jujur bahwa produk sudah dibuat', async () => {
    seedCatalog();
    listCashBankAccounts.mockResolvedValue([{ id: 'kas-1', name: 'Kas', balance_idr: 1000000 }]);
    createProduct.mockResolvedValue({ id: 'p-baru2', name: 'Kopi Lagi' });
    const { ApiError } = await import('@/lib/api/client');
    postTransaction.mockRejectedValueOnce(new ApiError(400, 'counter_account_required', 'Akun lawan harus diisi.'));
    renderBar();
    const kirim = await readyToSend();

    fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'beli Kopi Lagi 5 bungkus 50000' } });
    fireEvent.click(kirim);
    await screen.findByText(/Produk baru: Kopi Lagi/);
    fireEvent.click(screen.getByRole('button', { name: /buat.*catat/i }));

    expect(await screen.findByText(/sudah dibuat, pembelian gagal/)).toBeTruthy();
  });

  it('offline mematikan buat produk baru dengan alasan', async () => {
    seedCatalog();
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      renderBar();
      const kirim = await readyToSend();

      fireEvent.change(screen.getByLabelText(/cepat/i), { target: { value: 'beli Kopi Baru 5 bungkus 50000' } });
      fireEvent.click(kirim);

      expect(await screen.findByText(/Butuh koneksi internet/)).toBeTruthy();
      expect(screen.getByRole('button', { name: /buat.*catat/i })).toBeDisabled();
    } finally {
      online.mockRestore();
    }
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
