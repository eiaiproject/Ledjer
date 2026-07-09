import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('vitest runs and Intl is available', () => {
    expect(typeof Intl.NumberFormat).toBe('function');
  });

  it('formatIDR works', async () => {
    const { formatIDR } = await import('@/lib/utils');
    expect(formatIDR(1000000)).toContain('1.000.000');
  });
});
