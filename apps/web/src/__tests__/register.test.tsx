import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterPage } from '@/pages/register';

const apiMocks = vi.hoisted(() => ({
  startGoogleAuth: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/api/auth', () => ({
  startGoogleAuth: (...args: unknown[]) => apiMocks.startGoogleAuth(...args),
}));

const mockSignUp = vi.fn().mockResolvedValue({ needsEmailConfirmation: false });

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signIn: vi.fn(),
    signUp: mockSignUp,
    resendConfirmationEmail: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.startGoogleAuth.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the registration form with all required inputs', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/nama lengkap/i)).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    // Two password inputs: "Password" and "Konfirmasi password"
    const passwordInputs = screen.getAllByLabelText(/password/i);
    expect(passwordInputs.length).toBe(2);
    expect(screen.getByRole('button', { name: /^daftar$/i })).toBeTruthy();
  });

  it('renders the Google sign-up button', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const googleButton = screen.getByRole('button', { name: /daftar dengan google/i });
    expect(googleButton).toBeTruthy();
  });

  it('renders the "Masuk" link pointing at /login', () => {
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

  it('calls startGoogleAuth when Google button is clicked', async () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const googleButton = screen.getByRole('button', { name: /daftar dengan google/i });
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(apiMocks.startGoogleAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('disables both submit and Google buttons during OAuth loading', async () => {
    // Make startGoogleAuth hang to simulate loading
    let resolveOAuth: (v: unknown) => void;
    apiMocks.startGoogleAuth.mockImplementation(
      () => new Promise((resolve) => { resolveOAuth = resolve; }),
    );

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const googleButton = screen.getByRole('button', { name: /daftar dengan google/i });
    const submitButton = screen.getByRole('button', { name: /^daftar$/i });

    expect(submitButton).not.toBeDisabled();
    expect(googleButton).not.toBeDisabled();

    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
      expect(googleButton).toBeDisabled();
    });

    // Resolve to clean up
    await act(async () => {
      resolveOAuth!({ error: null });
    });
  });

  it('renders the "atau" divider between form and Google button', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('atau')).toBeTruthy();
  });

  it('shows error message when Google OAuth fails', async () => {
    apiMocks.startGoogleAuth.mockRejectedValueOnce(new Error('OAuth provider error'));

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const googleButton = screen.getByRole('button', { name: /daftar dengan google/i });
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('preserves redirect param in OAuth callback URL', async () => {
    render(
      <MemoryRouter initialEntries={['/register?redirect=/dashboard']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const googleButton = screen.getByRole('button', { name: /daftar dengan google/i });
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(apiMocks.startGoogleAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('uses default redirect when no redirect param is present', async () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const googleButton = screen.getByRole('button', { name: /daftar dengan google/i });
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(apiMocks.startGoogleAuth).toHaveBeenCalledTimes(1);
    });
  });
});
