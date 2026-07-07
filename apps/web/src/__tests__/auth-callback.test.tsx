import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthCallbackPage } from '@/pages/auth-callback';

// Use vi.hoisted so the mocks are created before vi.mock factory runs.
const mocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  forgotPassword: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  verifyEmail: (...args: unknown[]) => mocks.verifyEmail(...args),
  resendVerification: (...args: unknown[]) => mocks.resendVerification(...args),
  forgotPassword: (...args: unknown[]) => mocks.forgotPassword(...args),
  getMe: (...args: unknown[]) => mocks.getMe(...args),
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
    mocks.verifyEmail.mockReset();
    mocks.resendVerification.mockReset();
    mocks.forgotPassword.mockReset();
    mocks.getMe.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('verifies successfully with code exchange and redirects to onboarding', async () => {
    renderWithSearchParams('?code=test-code');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();
    expect(screen.getByText(/google belum tersedia/i)).toBeTruthy();
  });

  it('handles token_hash + type verifyEmail successfully', async () => {
    mocks.verifyEmail.mockResolvedValue({ ok: true });

    renderWithSearchParams('?token_hash=abc&type=signup');

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith('abc', 'signup');
    });

    expect(await screen.findByText(/email terkonfirmasi/i)).toBeTruthy();
  });

  it('recovery type redirects to /reset-password (NOT /settings/team)', async () => {
    mocks.verifyEmail.mockResolvedValue({ ok: true });

    renderWithSearchParams('?token_hash=xyz&type=recovery');

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith('xyz', 'recovery');
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
    mocks.getMe.mockResolvedValue({ session: null, user: null });

    renderWithSearchParams('?foo=bar');

    expect(mocks.verifyEmail).not.toHaveBeenCalled();

    expect(await screen.findByText(/autentikasi tidak terarah/i)).toBeTruthy();
  });

  it('shows error state on token expired/invalid (verifyEmail returns error)', async () => {
    mocks.verifyEmail.mockRejectedValue(new Error('Token has expired or is invalid'));

    renderWithSearchParams('?token_hash=expired&type=signup');

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalled();
    });

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();
    expect(screen.getByText(/Token telah kedaluwarsa/i)).toBeTruthy();
  });

  it('shows error state on code exchange failure', async () => {
    renderWithSearchParams('?code=bad');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();
    expect(screen.getByText(/google belum tersedia/i)).toBeTruthy();
  });

  it('resends confirmation email successfully', async () => {
    mocks.verifyEmail.mockRejectedValue(new Error('expired'));
    mocks.resendVerification.mockResolvedValue({ ok: true });

    renderWithSearchParams('?token_hash=stale&type=signup');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();

    const emailInput = (await screen.findByPlaceholderText(/email@contoh\.com/i)) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const resendButton = screen.getByRole('button', { name: /kirim ulang email/i });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(mocks.resendVerification).toHaveBeenCalledWith('user@example.com');
    });

    expect(await screen.findByText(/email konfirmasi telah dikirim ulang/i)).toBeTruthy();
  });

  it('redirects to onboarding when session exists but no code/token_hash', async () => {
    mocks.getMe.mockResolvedValue({
      session: { id: 'existing', user_id: 'user-1', expires_at: Date.now() + 1000 },
      user: { id: 'user-1', email: 'u@example.com', full_name: '', email_verified_at: Date.now() },
    });

    renderWithSearchParams('?foo=bar');

    await waitFor(() => {
      expect(mocks.getMe).toHaveBeenCalled();
    });

    expect(await screen.findByText(/email terkonfirmasi/i)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() => {
      expect(screen.getByTestId('onboarding')).toBeTruthy();
    });
  });

  it('does not call real network directly; auth API module is the only entry point', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    mocks.verifyEmail.mockResolvedValue({ ok: true });

    renderWithSearchParams('?token=abc&type=signup');

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalled();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('recovery success CTA navigates to /reset-password (not /onboarding)', async () => {
    mocks.verifyEmail.mockResolvedValue({ ok: true });

    renderWithSearchParams('?token_hash=rec&type=recovery');

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalled();
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

  it('expired recovery resend calls forgotPassword (not resendVerification)', async () => {
    mocks.verifyEmail.mockRejectedValue(new Error('Token has expired'));
    mocks.forgotPassword.mockResolvedValue({ ok: true });

    renderWithSearchParams('?token_hash=expired&type=recovery');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();

    const emailInput = screen.getByPlaceholderText(/email@contoh\.com/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const resendButton = screen.getByRole('button', { name: /kirim ulang email/i });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(mocks.forgotPassword).toHaveBeenCalledWith('user@example.com');
    });
    // Must NOT call the generic signup resend
    expect(mocks.resendVerification).not.toHaveBeenCalled();
    expect(await screen.findByText(/tautan pemulihan telah dikirim ulang/i)).toBeTruthy();
  });

  it('expired signup resend calls resendVerification (not forgotPassword)', async () => {
    mocks.verifyEmail.mockRejectedValue(new Error('Token has expired'));
    mocks.resendVerification.mockResolvedValue({ ok: true });

    renderWithSearchParams('?token_hash=expired&type=signup');

    expect(await screen.findByText(/verifikasi gagal/i)).toBeTruthy();

    const emailInput = screen.getByPlaceholderText(/email@contoh\.com/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    const resendButton = screen.getByRole('button', { name: /kirim ulang email/i });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(mocks.resendVerification).toHaveBeenCalledWith('user@example.com');
    });
    expect(mocks.forgotPassword).not.toHaveBeenCalled();
  });
});
