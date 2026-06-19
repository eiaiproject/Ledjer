/**
 * Client-side rate limiting utility
 * Prevents excessive API calls from the frontend
 */

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if an action is rate-limited
 * @param key - Unique identifier for the action (e.g., "login", "invite")
 * @param config - Rate limit configuration
 * @returns true if allowed, false if rate-limited
 */
export function checkRateLimit(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    rateLimitStore.set(key, { attempts: 1, firstAttempt: now });
    return true;
  }

  // Reset if window has passed
  if (now - entry.firstAttempt > config.windowMs) {
    rateLimitStore.set(key, { attempts: 1, firstAttempt: now });
    return true;
  }

  // Check if limit exceeded
  if (entry.attempts >= config.maxAttempts) {
    return false;
  }

  entry.attempts++;
  return true;
}

/**
 * Get remaining attempts
 */
export function getRemainingAttempts(key: string, config: RateLimitConfig): number {
  const entry = rateLimitStore.get(key);
  if (!entry) return config.maxAttempts;

  const now = Date.now();
  if (now - entry.firstAttempt > config.windowMs) {
    return config.maxAttempts;
  }

  return Math.max(0, config.maxAttempts - entry.attempts);
}

/**
 * Get time until rate limit resets (in ms)
 */
export function getResetTime(key: string, config: RateLimitConfig): number {
  const entry = rateLimitStore.get(key);
  if (!entry) return 0;

  const elapsed = Date.now() - entry.firstAttempt;
  return Math.max(0, config.windowMs - elapsed);
}

/**
 * Reset rate limit for a key
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Clear all rate limits
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

// Clean up old entries every 5 minutes
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.firstAttempt > 600000) {
        rateLimitStore.delete(key);
      }
    }
  }, 300000);
}

// Pre-defined rate limits for common actions
export const RATE_LIMITS = {
  login: { maxAttempts: 5, windowMs: 300000 }, // 5 attempts per 5 minutes
  register: { maxAttempts: 3, windowMs: 600000 }, // 3 attempts per 10 minutes
  invite: { maxAttempts: 10, windowMs: 3600000 }, // 10 attempts per hour
  transaction: { maxAttempts: 30, windowMs: 60000 }, // 30 per minute
  passwordReset: { maxAttempts: 3, windowMs: 900000 }, // 3 per 15 minutes
} as const;
