import { describe, it, expect } from "vitest";
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
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    }) as unknown as D1Database;

    const limited = await testRateLimit(db, "login", "user@test.com", 5, 60_000);
    expect(limited).toBe(false);
  });

  it("returns true when at the limit", async () => {
    const db = new FakeD1Database({
      run: () => ({ success: true, meta: { changes: 0 } }) as D1Result,
    }) as unknown as D1Database;

    const limited = await testRateLimit(db, "login", "user@test.com", 5, 60_000);
    expect(limited).toBe(true);
  });

  it("returns false when under the limit by one attempt", async () => {
    const db = new FakeD1Database({
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    }) as unknown as D1Database;

    const limited = await testRateLimit(db, "register", "192.168.1.1", 5, 3_600_000);
    expect(limited).toBe(false);
  });

  it("uses endpoint:key as bucket key for scoping", async () => {
    const captured: { sql: string; values: unknown[] }[] = [];

    const db = new FakeD1Database({
      run: (sql, values) => {
        captured.push({ sql: sql as string, values: values as unknown[] });
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
    }) as unknown as D1Database;

    await testRateLimit(db, "password_reset", "test@example.com", 3, 60_000);

    // Atomic INSERT ... SELECT ... WHERE COUNT < max — bucket_key appears twice (insert + WHERE)
    const insertCall = captured.find((q) => q.sql.includes("INSERT INTO rate_limits"));
    expect(insertCall).toBeDefined();
    expect(insertCall!.sql).toContain("COUNT(*)");
    expect(insertCall!.values[1]).toBe("password_reset:test@example.com");
    expect(insertCall!.values[4]).toBe("password_reset:test@example.com");
  });
});
