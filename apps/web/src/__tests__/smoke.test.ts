import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('vitest runs', () => {
    expect(true).toBe(true);
  });

  it('formatIDR works', async () => {
    const { formatIDR } = await import('@/lib/utils');
    expect(formatIDR(1000000)).toContain('1.000.000');
  });

  it('successful login reset clears the local cooldown', async () => {
    const { checkRateLimit, resetRateLimit } = await import('@/lib/rate-limit');
    const key = 'login:test@example.com';
    const limit = { maxAttempts: 1, windowMs: 300000 };

    expect(checkRateLimit(key, limit)).toBe(true);
    expect(checkRateLimit(key, limit)).toBe(false);
    resetRateLimit(key);
    expect(checkRateLimit(key, limit)).toBe(true);
  });
});
