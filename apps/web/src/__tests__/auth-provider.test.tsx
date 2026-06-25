import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  const { session, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
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

  it('renders error screen when getSession rejects, and clicking retry runs getSession again', async () => {
    mocks.getSession.mockRejectedValueOnce(new Error('Network failure'));
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Should show error state
    await waitFor(() => {
      expect(screen.getByText('Gagal memuat sesi')).toBeTruthy();
    });

    const retryButton = screen.getByRole('button', { name: /coba lagi/i });
    fireEvent.click(retryButton);

    // After retry it should succeed
    await waitFor(() => {
      expect(screen.getByText('Session: none')).toBeTruthy();
    });
  });
});
