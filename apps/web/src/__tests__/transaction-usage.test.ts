import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMonthlyTransactionUsage } from '@/lib/transaction-usage';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) },
}));

describe('fetchMonthlyTransactionUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalized usage data on success', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        count: 10,
        limit: 50,
        remaining: 40,
        period_start: '2026-06-01T00:00:00Z',
        period_end: '2026-07-01T00:00:00Z',
      },
      error: null,
    });

    const result = await fetchMonthlyTransactionUsage('org-id-1');

    expect(result).toEqual({
      count: 10,
      limit: 50,
      remaining: 40,
      periodStart: '2026-06-01T00:00:00Z',
      periodEnd: '2026-07-01T00:00:00Z',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_monthly_usage', { p_org_id: 'org-id-1' });
  });

  it('throws on RPC error', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    });

    await expect(fetchMonthlyTransactionUsage('org-id-1')).rejects.toThrow('permission denied');
  });

  it('throws on malformed RPC response (missing fields)', async () => {
    mocks.rpc.mockResolvedValue({
      data: { count: 5 },
      error: null,
    });

    await expect(fetchMonthlyTransactionUsage('org-id-1')).rejects.toThrow(
      'Respons pemakaian bulanan tidak valid',
    );
  });

  it('throws on malformed RPC response (null data)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(fetchMonthlyTransactionUsage('org-id-1')).rejects.toThrow(
      'Respons pemakaian bulanan tidak valid',
    );
  });

  it('throws on malformed RPC response (wrong types)', async () => {
    mocks.rpc.mockResolvedValue({
      data: { count: 'ten', limit: 50, remaining: 40, period_start: 123, period_end: 'x' },
      error: null,
    });

    await expect(fetchMonthlyTransactionUsage('org-id-1')).rejects.toThrow(
      'Respons pemakaian bulanan tidak valid',
    );
  });
});
