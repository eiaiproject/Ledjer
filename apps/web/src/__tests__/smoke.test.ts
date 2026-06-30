import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('vitest runs', () => {
    expect(true).toBe(true);
  });

  it('formatIDR works', async () => {
    const { formatIDR } = await import('@/lib/utils');
    expect(formatIDR(1000000)).toContain('1.000.000');
  });
});
