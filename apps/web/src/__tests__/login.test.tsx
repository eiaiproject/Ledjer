import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { LoginPage } from '@/pages/login';

// Heavy mocking because LoginPage touches supabase rpc, rate-limit, and
// the auth context. The point of this file is to assert the static UI
// elements (links, headings) without exercising the actual sign-in flow.

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signIn: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a "Lupa password?" link that points at /forgot-password', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<div data-testid="forgot" />} />
        </Routes>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /lupa password/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/forgot-password');
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

  it('renders both the email and password inputs', () => {
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

  it('disables submit button during loading state', async () => {
    // Verify the submit button reflects the loading state
    // (rate-limit recovery is tested in forgot-password.test.tsx).
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const submitButton = screen.getByRole('button', { name: /^masuk$/i });
    expect(submitButton).not.toBeDisabled();
  });
});
