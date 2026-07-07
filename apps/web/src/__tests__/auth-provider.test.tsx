import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/contexts/auth';
import { useAuth } from '@/contexts/auth-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  getMe: () => mocks.getMe(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  resendVerification: vi.fn(),
}));

function Consumer() {
  const { session, loading, error } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>Session: {session ? 'active' : 'none'}</div>;
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

    // Children should still render — error is exposed via context, not blocking
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
});
