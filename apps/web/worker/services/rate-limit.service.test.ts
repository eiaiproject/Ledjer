import { describe, it, expect, vi } from "vitest";
import { FakeD1Database } from "../test/fake-d1";

// Import after mocking Date.now
async function testRateLimit(
  db: D1Database,
  endpoint: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const { checkRateLimit } = await import("./rate-limit.service");
  return checkRateLimit(db, endpoint, key, { max, windowMs });
}

describe("Rate Limit Service", () => {
  it("returns false when under the limit", async () => {
    const db = new FakeD1Database({
      all: () => [],
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    }) as unknown as D1Database;

    const limited = await testRateLimit(db, "login", "user@test.com", 5, 60_000);
    expect(limited).toBe(false);
  });

  it("returns true when at the limit", async () => {
    const now = Date.now();
    const recentAttempts = Array.from({ length: 5 }, (_, i) => ({
      id: `attempt-${i}`,
    }));

    const db = new FakeD1Database({
      all: (sql) => {
        if (sql.includes("FROM rate_limits")) return recentAttempts;
        return [];
      },
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    }) as unknown as D1Database;

    const limited = await testRateLimit(db, "login", "user@test.com", 5, 60_000);
    expect(limited).toBe(true);
  });

  it("returns false when under the limit by one attempt", async () => {
    const attempts = Array.from({ length: 4 }, (_, i) => ({
      id: `attempt-${i}`,
    }));

    const db = new FakeD1Database({
      all: () => attempts,
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    }) as unknown as D1Database;

    const limited = await testRateLimit(db, "register", "192.168.1.1", 5, 3_600_000);
    expect(limited).toBe(false);
  });

  it("uses endpoint:key as bucket key for scoping", async () => {
    const capturedQueries: { sql: string; values: unknown[] }[] = [];

    const db = new FakeD1Database({
      all: (sql, values) => {
        capturedQueries.push({ sql: sql as string, values: values as unknown[] });
        return [];
      },
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    }) as unknown as D1Database;

    await testRateLimit(db, "password_reset", "test@example.com", 3, 60_000);

    // The bucket_key should be "password_reset:test@example.com"
    const selectCall = capturedQueries.find((q) => q.sql.includes("SELECT"));
    expect(selectCall).toBeDefined();
    expect(selectCall!.values[0]).toBe("password_reset:test@example.com");
  });
});
