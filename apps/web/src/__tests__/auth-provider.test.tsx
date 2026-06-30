import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/contexts/auth';
import { useAuth } from '@/contexts/auth-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mocks.getSession(),
      onAuthStateChange: (...args: unknown[]) => mocks.onAuthStateChange(...args),
    },
  },
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
    mocks.getSession.mockReset();
  });

  it('renders loading state initially then shows consumer content when successful', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

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
    mocks.getSession.mockRejectedValueOnce(new Error('Network failure'));

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

  it('loading resolves to guest session when getSession succeeds with null', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

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
