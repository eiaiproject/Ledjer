import { execute } from "../db/client";


export interface RateLimitConfig {
  /** Max requests allowed in the window. */
  max: number;
  /** Window in milliseconds. */
  windowMs: number;
}

/**
 * Generic sliding-window rate limit check using the `rate_limits` table.
 * Records a request if under limit, returns true if rate-limited.
 */
export async function checkRateLimit(
  db: D1Database,
  endpoint: string,
  key: string,
  config: RateLimitConfig,
): Promise<boolean> {
  const since = Date.now() - config.windowMs;
  const bucketKey = `${endpoint}:${key}`;
  const now = Date.now();
  const id = crypto.randomUUID();

  // Atomic check+insert: only inserts if count in window < max.
  // Single statement avoids TOCTOU; D1 serializes writes so this is safe.
  // Returns true (limited) when no row was inserted.
  const result = await execute(
    db,
    `INSERT INTO rate_limits (id, bucket_key, endpoint, created_at)
     SELECT ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM rate_limits WHERE bucket_key = ? AND created_at >= ?) < ?`,
    [id, bucketKey, endpoint, now, bucketKey, since, config.max],
  );

  const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0;
  return changes === 0;
}
