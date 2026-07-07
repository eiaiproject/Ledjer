import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ForgotPasswordPage } from '@/pages/forgot-password';

const mocks = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  forgotPassword: (...args: unknown[]) => mocks.forgotPassword(...args),
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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<div data-testid="login" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    mocks.forgotPassword.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the email form with a "back to login" link', () => {
    renderAt('/forgot-password');

    expect(
      screen.getByRole('heading', { name: /atur ulang password/i }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /masuk$/i })).toBeTruthy();
  });

  it('rejects an invalid email address client-side', async () => {
    renderAt('/forgot-password');

    // Use fireEvent.submit on the form directly. fireEvent.click on the
    // button should also work, but RHF sometimes binds the submit handler
    // to the form's onSubmit rather than the button's click.
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        screen.getByText(/email tidak valid/i),
      ).toBeTruthy();
    });
    expect(mocks.forgotPassword).not.toHaveBeenCalled();
  });

  it('calls forgotPassword with the trimmed lowercased email', async () => {
    mocks.forgotPassword.mockResolvedValue({ ok: true });

    renderAt('/forgot-password');

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: '  USER@Example.COM  ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    await waitFor(() => {
      expect(mocks.forgotPassword).toHaveBeenCalledTimes(1);
    });

    const [email] = mocks.forgotPassword.mock.calls[0]!;
    expect(email).toBe('user@example.com');
  });

  it('shows success view for auth-level errors (no account enumeration)', async () => {
    // Worker password recovery always returns a generic success response so
    // the page never reveals whether the email is registered.
    mocks.forgotPassword.mockResolvedValue({ ok: true });

    renderAt('/forgot-password');

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    // The auth error must NOT appear in the DOM — it would leak account
    // existence. Instead, the success view appears.
    await waitFor(() => {
      expect(screen.getByText(/cek email Anda$/i)).toBeTruthy();
    });
    expect(screen.queryByText(/user not found/i)).toBeNull();
    expect(screen.getByText(/nobody@example\.com/i)).toBeTruthy();
  });

  it('shows network/service errors to user (non-enumeration errors)', async () => {
    // A genuine operational error (network failure) must NOT be swallowed.
    mocks.forgotPassword.mockRejectedValue(
      new Error('Service unavailable'),
    );

    renderAt('/forgot-password');

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    // Operational errors should still be shown to the user via translateError.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.queryByText(/cek email Anda$/i)).toBeNull();
  });

  it('offers a "back to login" link from the success view', async () => {
    mocks.forgotPassword.mockResolvedValue({ ok: true });

    renderAt('/forgot-password');

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/cek email Anda$/i)).toBeTruthy();
    });

    const backLink = screen.getByRole('link', {
      name: /kembali ke halaman masuk/i,
    });
    expect(backLink.getAttribute('href')).toBe('/login');
  });
});
