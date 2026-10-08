import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider } from '@/contexts/auth';
import { useAuth } from '@/contexts/auth-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  clearOfflineSession: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  getMe: () => mocks.getMe(),
  login: vi.fn(),
  logout: () => mocks.logout(),
  register: vi.fn(),
  resendVerification: vi.fn(),
}));

vi.mock('@/lib/offline-auth', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  clearOfflineSession: () => mocks.clearOfflineSession(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function Consumer() {
  const { session, loading, error, signOut } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return (
    <div>
      <div>Session: {session ? 'active' : 'none'}</div>
      <button type="button" onClick={() => void signOut()}>
        Keluar
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    mocks.getMe.mockReset();
    mocks.logout.mockReset();
    mocks.clearOfflineSession.mockReset();
  });

  it('renders loading state initially then shows consumer content when successful', async () => {
    mocks.getMe.mockResolvedValue({ session: null, user: null });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('Loading...')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Session: none')).toBeTruthy();
    });
  });

  it('exposes error via context instead of blocking render when getSession rejects', async () => {
    mocks.getMe.mockRejectedValueOnce(new Error('Network failure'));

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Children should still render - error is exposed via context, not blocking
    await waitFor(() => {
      expect(screen.getByText('Error: Network failure')).toBeTruthy();
    });
  });

  it('loading resolves to guest session when getMe succeeds with null', async () => {
    mocks.getMe.mockResolvedValue({ session: null, user: null });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Session: none')).toBeTruthy();
    });
  });

  function renderAuth() {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  it.each([
    {
      name: 'even when server logout rejects',
      setup: () => mocks.logout.mockRejectedValueOnce(new Error('Network failure')),
    },
    {
      name: 'when server logout succeeds',
      setup: () => mocks.logout.mockResolvedValueOnce({ ok: true }),
    },
  ])('signOut clears local session $name', async ({ setup }) => {
    mocks.getMe.mockResolvedValue({ session: null, user: null });
    setup();
    renderAuth();

    await waitFor(() => {
      expect(screen.getByText('Session: none')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledTimes(1);
      expect(mocks.clearOfflineSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Session: none')).toBeTruthy();
    });
  });
});
