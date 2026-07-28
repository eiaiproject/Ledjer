import { execute, queryAll } from "../db/client";

// L-07: Recommended index (add via migration):
// CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_created
//   ON rate_limits(bucket_key, created_at);


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

  const rows = await queryAll<{ id: string }>(
    db,
    `SELECT id FROM rate_limits
     WHERE bucket_key = ? AND created_at >= ?
     LIMIT ?`,
    [bucketKey, since, config.max],
  );

  if (rows.length >= config.max) return true; // rate-limited

  await execute(
    db,
    `INSERT INTO rate_limits (id, bucket_key, endpoint, created_at)
     VALUES (?, ?, ?, ?)`,
    [crypto.randomUUID(), bucketKey, endpoint, Date.now()],
  );

  return false;
}
