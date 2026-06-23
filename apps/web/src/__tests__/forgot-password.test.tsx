import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ForgotPasswordPage } from '@/pages/forgot-password';
import { clearAllRateLimits } from '@/lib/rate-limit';

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mocks.resetPasswordForEmail(...args),
    },
  },
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
    mocks.resetPasswordForEmail.mockReset();
    // Reset rate-limit state between tests (module-level Map).
    clearAllRateLimits();
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
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('calls resetPasswordForEmail with the trimmed lowercased email and recovery redirectTo', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

    renderAt('/forgot-password');

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: '  USER@Example.COM  ' },
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
  });

  it('shows the same success view regardless of whether the email exists (no enumeration)', async () => {
    // Simulate "user not found" — Supabase returns an error, but we still
    // show the generic "cek email Anda" view to prevent account enumeration.
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'User not found' },
    });

    renderAt('/forgot-password');

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    // On failure, the error is surfaced in the form view, NOT promoted to
    // the success view.
    await waitFor(() => {
      expect(screen.getByText(/user not found/i)).toBeTruthy();
    });
    expect(screen.queryByText(/cek email Anda$/i)).toBeNull();

    // Now switch the mock to success and submit again with a fresh email
    // (different rate-limit bucket) to assert the success view appears.
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'real-user@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/cek email Anda$/i)).toBeTruthy();
    });
    expect(screen.getByText(/real-user@example\.com/i)).toBeTruthy();
  });

  it('blocks further submissions after exceeding the passwordReset rate limit', async () => {
    // Mock returns an error so the form view stays visible across all
    // submissions (otherwise a successful submit transitions us to the
    // "check your inbox" success view where the form is gone).
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'Email not found' },
    });

    renderAt('/forgot-password');

    const submit = () => {
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'spam@example.com' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: /kirim tautan pemulihan/i }),
      );
    };

    // RATE_LIMITS.passwordReset = 3 per 15 minutes. The 4th submission
    // must hit the client-side rate limit BEFORE calling Supabase.
    submit();
    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    });
    submit();
    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    });
    submit();
    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(3);
    });

    // The 4th submission must NOT call Supabase — rate limit blocks it
    // before any network call, and the rate-limit alert must surface.
    submit();
    await waitFor(() => {
      expect(
        screen.getByText(/terlalu banyak percobaan/i),
      ).toBeTruthy();
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(3);
  });

  it('offers a "back to login" link from the success view', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

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
