import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import { DashboardLayout } from '@/layouts/dashboard';
import { renderWithProviders } from './test-utils';

vi.mock('@/contexts/auth-context', async () => {
  const { authStub } = await import('./test-utils');
  return { useAuth: () => authStub };
});

vi.mock('@/hooks/useOrganization', async () => {
  const { orgStub } = await import('./test-utils');
  return { useOrganization: () => orgStub };
});

function renderLayoutAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<div>dash</div>} />
        <Route path="/transactions/:id" element={<div>detail</div>} />
        <Route path="/settings" element={<div>settings</div>} />
      </Route>
    </Routes>,
    path,
  );
}

function bottomNav() {
  return screen.getByRole('navigation', { name: 'Navigasi mobile' });
}

describe('DashboardLayout bottom nav (distill: 5 slot)', () => {
  it('hanya menampilkan 4 tab harian + Lainnya (tanpa Pengaturan)', () => {
    renderLayoutAt('/dashboard');
    const nav = bottomNav();
    expect(within(nav).getByRole('link', { name: /beranda/i })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /transaksi/i })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /kas & bank/i })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /produk/i })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: /pengaturan/i })).toBeNull();
    expect(within(nav).getByRole('button', { name: /lainnya/i })).toBeTruthy();
  });

  it('Lainnya aktif saat berada di rute yang hanya ada di drawer (mis. Pengaturan)', () => {
    renderLayoutAt('/settings');
    const nav = bottomNav();
    expect(within(nav).getByRole('button', { name: /lainnya/i }).getAttribute('aria-current')).toBe('page');
  });

  it('tab Transaksi tetap aktif di halaman detail (/transactions/:id)', () => {
    renderLayoutAt('/transactions/abc-123');
    const nav = bottomNav();
    expect(within(nav).getByRole('link', { name: /transaksi/i }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('button', { name: /lainnya/i }).getAttribute('aria-current')).toBeNull();
  });
});
