import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { RegisterPage } from '@/pages/register';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
  }),
}));

describe('RegisterPage', () => {
  it('renders all registration fields', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/nama lengkap/i)).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/nama usaha/i)).toBeTruthy();
    expect(screen.getAllByLabelText(/password/i).length).toBeGreaterThanOrEqual(2);
  });

  it('renders a submit button labeled Buat akun gratis', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const submitButton = screen.getByRole('button', { name: /buat akun gratis/i });
    expect(submitButton).toBeTruthy();
    expect(submitButton).not.toBeDisabled();
  });

  it('renders a "Masuk" link that points at /login', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const loginLink = screen.getByRole('link', { name: /masuk$/i });
    expect(loginLink).toBeTruthy();
    expect(loginLink.getAttribute('href')).toBe('/login');
  });
});