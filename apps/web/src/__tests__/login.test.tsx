import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { LoginPage } from '@/pages/login';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signIn: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('renders email and password inputs', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
  });

  it('renders a "Daftar" link that points at /register', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /daftar/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/register');
  });

  it('renders a submit button labeled Masuk', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const submitButton = screen.getByRole('button', { name: /^masuk$/i });
    expect(submitButton).toBeTruthy();
    expect(submitButton).not.toBeDisabled();
  });
});