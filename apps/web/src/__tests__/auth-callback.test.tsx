import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthCallbackPage } from '@/pages/auth-callback';

// Use vi.hoisted so the mocks are created before vi.mock factory runs.
const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  resend: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mocks.exchangeCodeForSession(...args),
      verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
      resend: (...args: unknown[]) => mocks.resend(...args),
    },
  },
}));

// Capture the navigated path so tests can assert the destination.
function LocationCapture() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

// Helper: render AuthCallbackPage with controlled search params.
function renderWithSearchParams(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <LocationCapture />
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/onboarding" element={<div data-testid="onboarding" />} />
        <Route path="/login" element={<div data-testid="login" />} />
        <Route path="/settings/team" element={<div data-testid="team" />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.exchangeCodeForSession.mockReset();
    mocks.verifyOtp.mockReset();
    mocks.resend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('verifies successfully with code exchange and redirects to onboarding', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });

    renderWithSearchParams('?code=test-code');

    await waitFor(() => {
      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
    });

    expect(await screen.findByText(/email terkonfirmasi/i)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() => {
      expect(screen.getByTestId('onboarding')).toBeTruthy();
    });
  });

  it('handles token_hash + type verifyOtp successfully', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });

    renderWithSearchParams('?token_hash=abc&type=signup');

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'abc',
        type: 'signup',
      });
    });

    expect(await screen.findByText(/email terkonfirmasi/i)).toBeTruthy();
  });

  it('recovery type redirects to settings/team instead of onboarding', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });

    renderWithSearchParams('?token_hash=xyz&type=recovery');

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'xyz',
        type: 'recovery',
      });
    });

    expect(await screen.findByText(/email terkonfirmasi/i)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() => {
      expect(screen.getByTestId('team')).toBeTruthy();
    });
  });

  it('shows invalid state when neither code nor token_hash is present', async () => {
    renderWithSearchParams('?foo=bar');

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();

    expect(await screen.findByText(/tautan tidak lengkap/i)).toBeTruthy();
  });

  it('shows error state on token expired/invalid (verifyOtp returns error)', async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: 'Token has expired or is invalid' },
    });

    renderWithSearchParams('?token_hash=expired&type=signup');

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalled();
    });

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();
    expect(screen.getByText(/token has expired or is invalid/i)).toBeTruthy();
  });

  it('shows error state on code exchange failure', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'Invalid grant' },
    });

    renderWithSearchParams('?code=bad');

    await waitFor(() => {
      expect(mocks.exchangeCodeForSession).toHaveBeenCalled();
    });

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();
    expect(screen.getByText(/invalid grant/i)).toBeTruthy();
  });

  it('resends confirmation email successfully', async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: 'expired' },
    });
    mocks.resend.mockResolvedValue({ error: null });

    renderWithSearchParams('?token_hash=stale&type=signup');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();

    const emailInput = (await screen.findByPlaceholderText(/email@contoh\.com/i)) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const resendButton = screen.getByRole('button', { name: /kirim ulang email/i });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(mocks.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'user@example.com',
      });
    });

    expect(await screen.findByText(/email konfirmasi telah dikirim ulang/i)).toBeTruthy();
  });

  it('does not call real network — supabase.auth methods are the only entry point', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });

    renderWithSearchParams('?code=abc');

    await waitFor(() => {
      expect(mocks.exchangeCodeForSession).toHaveBeenCalled();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

