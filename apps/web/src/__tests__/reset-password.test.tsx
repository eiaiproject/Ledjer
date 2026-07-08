import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ResetPasswordPage } from '@/pages/reset-password';

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  sessionState: { current: null as null | object },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    session: mocks.sessionState.current,
    user: mocks.sessionState.current ? { id: 'user-1' } : null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    signOut: (...args: unknown[]) => mocks.signOut(...args),
  }),
}));

vi.mock('@/lib/api/auth', () => ({
  resetPassword: (...args: unknown[]) => mocks.resetPassword(...args),
}));

function LocationCapture() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationCapture />
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div data-testid="login" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.resetPassword.mockReset();
    mocks.signOut.mockReset();
    mocks.sessionState.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows request-new-link message when there is no recovery session', () => {
    mocks.sessionState.current = null;

    renderAt('/reset-password');

    expect(
      screen.getByText(/tautan pemulihan tidak valid atau sudah kedaluwarsa/i),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /kembali ke halaman masuk/i })).toBeTruthy();
  });

  it('renders the password form when a recovery session is present', async () => {
    mocks.sessionState.current = { access_token: 'tok', user: { id: 'u' } };

    renderAt('/reset-password');

    expect(screen.getByLabelText(/password baru/i)).toBeTruthy();
    expect(screen.getByLabelText(/konfirmasi password/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /perbarui password/i })).toBeTruthy();
  });

  it('rejects mismatched password confirmation', async () => {
    mocks.sessionState.current = { access_token: 'tok', user: { id: 'u' } };

    renderAt('/reset-password');

    fireEvent.change(screen.getByLabelText(/^password baru$/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/konfirmasi password/i), {
      target: { value: 'different123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /perbarui password/i }));

    await waitFor(() => {
      expect(screen.getByText(/konfirmasi password tidak cocok/i)).toBeTruthy();
    });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    mocks.sessionState.current = { access_token: 'tok', user: { id: 'u' } };

    renderAt('/reset-password');

    fireEvent.change(screen.getByLabelText(/^password baru$/i), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText(/konfirmasi password/i), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /perbarui password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password minimal 8 karakter/i)).toBeTruthy();
    });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it('calls resetPassword with the new password and signs out on success', async () => {
    mocks.sessionState.current = { access_token: 'tok', user: { id: 'u' } };
    mocks.resetPassword.mockResolvedValue({ ok: true });
    mocks.signOut.mockResolvedValue(undefined);

    renderAt('/reset-password');

    fireEvent.change(screen.getByLabelText(/^password baru$/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/konfirmasi password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /perbarui password/i }));

    await waitFor(() => {
      expect(mocks.resetPassword).toHaveBeenCalledWith('newpassword123');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalled();
      expect(screen.getByTestId('login')).toBeTruthy();
    });
  });

  it('surfaces an error when resetPassword fails', async () => {
    mocks.sessionState.current = { access_token: 'tok', user: { id: 'u' } };
    mocks.resetPassword.mockRejectedValue(
      new Error('Password should be different from previous'),
    );

    renderAt('/reset-password');

    fireEvent.change(screen.getByLabelText(/^password baru$/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/konfirmasi password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /perbarui password/i }));

    await waitFor(() => {
      expect(screen.getByText(/Password baru harus berbeda/i)).toBeTruthy();
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
