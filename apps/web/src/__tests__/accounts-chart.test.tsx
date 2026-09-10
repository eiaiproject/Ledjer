import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChartOfAccountsPage } from '@/pages/accounts/chart';

vi.mock('@/contexts/auth-context', async () => {
  const { authStub } = await import('./test-utils');
  return { useAuth: () => authStub };
});

vi.mock('@/hooks/useOrganization', async () => {
  const { orgStub } = await import('./test-utils');
  return { useOrganization: () => orgStub };
});

const listAccounts = vi.fn();
const createAccount = vi.fn();
vi.mock('@/lib/api/accounts', () => ({
  listAccounts: (...args: unknown[]) => listAccounts(...args),
  createAccount: (...args: unknown[]) => createAccount(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const accounts = [
  { id: 'a-kas', organization_id: 'o1', code: '1110', name: 'Kas', account_class: 'asset', account_subtype: 'cash', is_system: 1, is_active: 1, created_at: 0, updated_at: 0 },
  { id: 'a-modal', organization_id: 'o1', code: '3110', name: 'Modal Pemilik', account_class: 'equity', account_subtype: null, is_system: 1, is_active: 1, created_at: 0, updated_at: 0 },
  { id: 'a-rev', organization_id: 'o1', code: '4110', name: 'Pendapatan Usaha', account_class: 'income', account_subtype: null, is_system: 1, is_active: 1, created_at: 0, updated_at: 0 },
  { id: 'a-beban', organization_id: 'o1', code: '6120', name: 'Beban Sewa', account_class: 'expense', account_subtype: null, is_system: 1, is_active: 1, created_at: 0, updated_at: 0 },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/accounts/chart']}>
        <Routes>
          <Route path="/accounts/chart" element={<ChartOfAccountsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ChartOfAccountsPage', () => {
  it('tombol kembali ke Kas & Bank', async () => {
    listAccounts.mockResolvedValue(accounts);
    renderPage();

    expect(await screen.findByText('Aset')).toBeTruthy();
    expect(screen.getByRole('link', { name: /kembali.*kas.*bank/i })).toHaveAttribute('href', '/accounts');
  });

  it('pencarian memfilter akun', async () => {
    listAccounts.mockResolvedValue(accounts);
    renderPage();

    expect(await screen.findByText('4110')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/cari akun/i), { target: { value: 'sewa' } });
    await waitFor(() => {
      expect(screen.queryByText('4110')).toBeNull();
    });
    expect(screen.getByText('6120')).toBeTruthy();
  });

  it('grup klasifikasi bisa dilipat', async () => {
    listAccounts.mockResolvedValue(accounts);
    renderPage();

    expect(await screen.findByText('4110')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /pendapatan/i }));
    expect(screen.queryByText('4110')).toBeNull();
  });

  it('mengelompokkan akun per klasifikasi', async () => {
    listAccounts.mockResolvedValue(accounts);
    renderPage();

    expect(await screen.findByText('Aset')).toBeTruthy();
    expect(screen.getByText('Ekuitas')).toBeTruthy();
    expect(screen.getByText('Pendapatan')).toBeTruthy();
    expect(screen.getByText('Beban')).toBeTruthy();
    expect(screen.queryByText('Kewajiban')).toBeNull();
    expect(screen.getByText('4110')).toBeTruthy();
  });

  it('tambah akun beban lewat modal', async () => {
    listAccounts.mockResolvedValue(accounts);
    createAccount.mockResolvedValue({ id: 'a-x', code: '6200', name: 'Beban Iklan' });
    window.HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    renderPage();

    expect(await screen.findByText('Beban')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Tambah Akun$/ }));
    fireEvent.change(await screen.findByLabelText('Nama Akun'), { target: { value: 'Beban Iklan' } });
    fireEvent.change(screen.getByLabelText('Klasifikasi'), { target: { value: 'expense' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Akun' }));
    await waitFor(() => {
      expect(createAccount).toHaveBeenCalledWith('expense', 'Beban Iklan');
    });
  });
});
