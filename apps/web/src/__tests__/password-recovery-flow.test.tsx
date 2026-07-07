import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import { ForgotPasswordPage } from '@/pages/forgot-password';
import { AuthCallbackPage } from '@/pages/auth-callback';
import { ResetPasswordPage } from '@/pages/reset-password';

/**
 * End-to-end integration test for the password recovery flow.
 *
 * Steps:
 *   1. User lands on /forgot-password, enters email, submits.
 *      Worker forgotPassword API is called.
 *   2. User clicks the recovery link in their email — lands on
 *      /auth/callback?token_hash=...&type=recovery.
 *      Worker verifyEmail(..., 'recovery') is called and a temporary session
 *      is established.
 *   3. AuthCallbackPage redirects to /reset-password.
 *   4. User enters a new password and submits.
 *      Worker resetPassword(password) is called, then signOut is called,
 *      then router pushes to /login.
 *
 * The full chain is wired correctly end-to-end. If any step regresses
 * (e.g., someone changes the recovery redirect target), this test
 * fails with a clear message.
 */

const mocks = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  verifyEmail: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  // Mutable session state — set by mocked verifyEmail, read by useAuth().
  sessionRef: { current: null as null | object },
}));

vi.mock('@/lib/api/auth', () => ({
  forgotPassword: (...args: unknown[]) => mocks.forgotPassword(...args),
  verifyEmail: (...args: unknown[]) => mocks.verifyEmail(...args),
  resetPassword: (...args: unknown[]) => mocks.resetPassword(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    session: mocks.sessionRef.current,
    user: mocks.sessionRef.current
      ? { id: 'recovery-user' }
      : null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    signOut: (...args: unknown[]) => mocks.signOut(...args),
  }),
}));

function FullRouter({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div data-testid="login" />} />
        <Route path="/onboarding" element={<div data-testid="onboarding" />} />
        <Route
          path="/settings/team"
          element={<div data-testid="team" />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('Password recovery flow (integration)', () => {
  beforeEach(() => {
    mocks.forgotPassword.mockReset();
    mocks.verifyEmail.mockReset();
    mocks.resetPassword.mockReset();
    mocks.signOut.mockReset();
    mocks.sessionRef.current = null;
    // AuthCallbackPage uses setTimeout before navigating — make them
    // resolve instantly so we don't have to wait the 1.2s in tests.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('flows /forgot-password → /auth/callback → /reset-password → /login', async () => {
    // ── Step 1: user requests password reset ────────────────────────
    mocks.forgotPassword.mockResolvedValue({ ok: true });

    render(<FullRouter initialPath="/forgot-password" />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    await waitFor(() => {
      expect(mocks.forgotPassword).toHaveBeenCalledTimes(1);
    });

    const [email] = mocks.forgotPassword.mock.calls[0]!;
    expect(email).toBe('user@example.com');

    // Success view appears (no account enumeration).
    await waitFor(() => {
      expect(screen.getByText(/cek email Anda$/i)).toBeTruthy();
    });
    expect(screen.getByText(/user@example\.com/i)).toBeTruthy();

    cleanup();

    // ── Step 2: user clicks the recovery link in their email ─────────
    // verifyEmail establishes a temporary session.
    mocks.verifyEmail.mockImplementation(async () => {
      mocks.sessionRef.current = {
        id: 'recovery-token',
        user_id: 'recovery-user',
        expires_at: Date.now() + 3600_000,
      };
      return { ok: true };
    });

    render(
      <FullRouter initialPath="/auth/callback?token_hash=abc&type=recovery" />,
    );

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalledWith('abc', 'recovery');
    });

    // Wait for the success state to render before the navigation.
    await waitFor(() => {
      expect(screen.getByText(/email terkonfirmasi/i)).toBeTruthy();
    });

    // AuthCallbackPage redirects after a 1.2s setTimeout — advance time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // ── Step 3: lands on /reset-password ──────────────────────────────
    await waitFor(() => {
      expect(screen.getByText(/atur ulang password/i)).toBeTruthy();
    });
    expect(screen.getByLabelText(/^password baru$/i)).toBeTruthy();
    expect(screen.getByLabelText(/konfirmasi password/i)).toBeTruthy();

    // ── Step 4: submit new password ───────────────────────────────────
    mocks.resetPassword.mockResolvedValue({ ok: true });
    mocks.signOut.mockResolvedValue(undefined);

    fireEvent.change(screen.getByLabelText(/^password baru$/i), {
      target: { value: 'newSecurePassword123' },
    });
    fireEvent.change(screen.getByLabelText(/konfirmasi password/i), {
      target: { value: 'newSecurePassword123' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /perbarui password/i }),
    );

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledWith('newSecurePassword123');
    });

    // After successful update, page signs out then redirects to /login
    // after a 1.5s setTimeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('login')).toBeTruthy();
    });
  });

  it('rejects recovery flow if verifyEmail fails (token expired / invalid)', async () => {
    mocks.verifyEmail.mockRejectedValue(new Error('Token has expired or is invalid'));

    render(
      <FullRouter initialPath="/auth/callback?token_hash=expired&type=recovery" />,
    );

    await waitFor(() => {
      expect(screen.getByText(/verifikasi gagal/i)).toBeTruthy();
    });
    expect(
      screen.getByText(/Token telah kedaluwarsa/i),
    ).toBeTruthy();
    // No navigation happens on error.
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it('does not redirect a recovery link to /settings/team or /onboarding', async () => {
    mocks.verifyEmail.mockImplementation(async () => {
      mocks.sessionRef.current = {
        id: 'recovery-token',
        user_id: 'recovery-user',
        expires_at: Date.now() + 3600_000,
      };
      return { ok: true };
    });

    render(
      <FullRouter initialPath="/auth/callback?token_hash=xyz&type=recovery" />,
    );

    await waitFor(() => {
      expect(mocks.verifyEmail).toHaveBeenCalled();
    });
    expect(screen.getByText(/email terkonfirmasi/i)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // Recovery must land on /reset-password — never on /settings/team
    // or /onboarding (the original bug from the previous pass).
    await waitFor(() => {
      expect(screen.getByText(/atur ulang password/i)).toBeTruthy();
    });
    expect(screen.queryByTestId('team')).toBeNull();
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });
});
