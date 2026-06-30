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
 *      supabase.auth.resetPasswordForEmail called with redirectTo
 *      pointing at /auth/callback?type=recovery.
 *   2. User clicks the recovery link in their email — lands on
 *      /auth/callback?token_hash=...&type=recovery.
 *      supabase.auth.verifyOtp({ type: 'recovery' }) is called and
 *      a temporary session is established.
 *   3. AuthCallbackPage redirects to /reset-password.
 *   4. User enters a new password and submits.
 *      supabase.auth.updateUser({ password }) is called, then
 *      signOut is called, then router pushes to /login.
 *
 * The full chain is wired correctly end-to-end. If any step regresses
 * (e.g., someone changes the recovery redirect target), this test
 * fails with a clear message.
 */

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  // Mutable session state — set by mocked verifyOtp, read by useAuth().
  sessionRef: { current: null as null | object },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) =>
        mocks.resetPasswordForEmail(...args),
      exchangeCodeForSession: (...args: unknown[]) =>
        mocks.exchangeCodeForSession(...args),
      verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
      updateUser: (...args: unknown[]) => mocks.updateUser(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
    },
  },
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
    signOut: vi.fn(),
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
    mocks.resetPasswordForEmail.mockReset();
    mocks.exchangeCodeForSession.mockReset();
    mocks.verifyOtp.mockReset();
    mocks.updateUser.mockReset();
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
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

    render(<FullRouter initialPath="/forgot-password" />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    });

    const [email, options] = mocks.resetPasswordForEmail.mock.calls[0]!;
    expect(email).toBe('user@example.com');
    expect(options).toEqual({
      redirectTo: expect.stringMatching(/\/auth\/callback\?type=recovery$/),
    });

    // Success view appears (no account enumeration).
    await waitFor(() => {
      expect(screen.getByText(/cek email Anda$/i)).toBeTruthy();
    });
    expect(screen.getByText(/user@example\.com/i)).toBeTruthy();

    cleanup();

    // ── Step 2: user clicks the recovery link in their email ─────────
    // verifyOtp establishes a temporary session.
    mocks.verifyOtp.mockImplementation(async () => {
      mocks.sessionRef.current = {
        access_token: 'recovery-token',
        refresh_token: 'recovery-refresh',
        user: { id: 'recovery-user', email: 'user@example.com' },
      };
      return { error: null };
    });

    render(
      <FullRouter initialPath="/auth/callback?token_hash=abc&type=recovery" />,
    );

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        token_hash: 'abc',
        type: 'recovery',
      });
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
    mocks.updateUser.mockResolvedValue({ error: null });
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
      expect(mocks.updateUser).toHaveBeenCalledWith({
        password: 'newSecurePassword123',
      });
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

  it('rejects recovery flow if verifyOtp fails (token expired / invalid)', async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: 'Token has expired or is invalid' },
    });

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
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('does not redirect a recovery link to /settings/team or /onboarding', async () => {
    mocks.verifyOtp.mockImplementation(async () => {
      mocks.sessionRef.current = {
        access_token: 'recovery-token',
        user: { id: 'recovery-user' },
      };
      return { error: null };
    });

    render(
      <FullRouter initialPath="/auth/callback?token_hash=xyz&type=recovery" />,
    );

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalled();
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
