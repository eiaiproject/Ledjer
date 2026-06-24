import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthCallbackPage } from '@/pages/auth-callback';

// Use vi.hoisted so the mocks are created before vi.mock factory runs.
const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mocks.exchangeCodeForSession(...args),
      verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
      resend: (...args: unknown[]) => mocks.resend(...args),
      resetPasswordForEmail: (...args: unknown[]) => mocks.resetPasswordForEmail(...args),
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
        <Route path="/reset-password" element={<div data-testid="reset-password" />} />
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
    mocks.resetPasswordForEmail.mockReset();
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

  it('recovery type redirects to /reset-password (NOT /settings/team)', async () => {
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

    // Must land on /reset-password — the recovery flow should never
    // redirect to /settings/team (unrelated) or anywhere else.
    await waitFor(() => {
      expect(screen.getByTestId('reset-password')).toBeTruthy();
    });
    expect(screen.queryByTestId('team')).toBeNull();
    expect(screen.queryByTestId('onboarding')).toBeNull();
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

  it('recovery success CTA navigates to /reset-password (not /onboarding)', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });

    renderWithSearchParams('?token_hash=rec&type=recovery');

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalled();
    });

    expect(await screen.findByText(/email terkonfirmasi/i)).toBeTruthy();

    // The success CTA must say 'Atur password baru' and link to /reset-password.
    const ctaButton = screen.getByRole('button', { name: /atur password baru/i });
    expect(ctaButton).toBeTruthy();

    fireEvent.click(ctaButton);

    await waitFor(() => {
      expect(screen.getByTestId('reset-password')).toBeTruthy();
    });
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });

  it('expired recovery resend calls resetPasswordForEmail (not auth.resend)', async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: 'Token has expired' },
    });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

    renderWithSearchParams('?token_hash=expired&type=recovery');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();

    const emailInput = screen.getByPlaceholderText(/email@contoh\.com/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const resendButton = screen.getByRole('button', { name: /kirim ulang email/i });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
        'user@example.com',
        { redirectTo: expect.stringMatching(/\/auth\/callback\?type=recovery$/) },
      );
    });
    // Must NOT call the generic signup resend
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(await screen.findByText(/tautan pemulihan telah dikirim ulang/i)).toBeTruthy();
  });

  it('expired signup resend calls auth.resend (not resetPasswordForEmail)', async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: 'Token has expired' },
    });
    mocks.resend.mockResolvedValue({ error: null });

    renderWithSearchParams('?token_hash=expired&type=signup');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();

    const emailInput = screen.getByPlaceholderText(/email@contoh\.com/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const resendButton = screen.getByRole('button', { name: /kirim ulang email/i });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(mocks.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'user@example.com',
      });
    });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

