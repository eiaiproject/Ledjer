import { describe, it, expect } from "vitest";
import { FakeD1Database } from "../test/fake-d1";

describe("Maintenance Service", () => {
  it("cleans up expired sessions, verifications, tokens, and old audit logs", async () => {
    const { cleanupExpiredRows } = await import("./maintenance.service");
    const executedQueries: string[] = [];

    const db = new FakeD1Database({
      run: (sql) => {
        executedQueries.push(sql as string);
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
    }) as unknown as D1Database;

    const result = await cleanupExpiredRows(db, Date.now());

    expect(result.sessions).toBe(1);
    expect(result.emailVerifications).toBe(1);
    expect(result.passwordResetTokens).toBe(1);

    const deleteCount = executedQueries.filter((q) => q.includes("DELETE FROM")).length;
    expect(deleteCount).toBe(5); // sessions, email_verifications, password_reset_tokens, login_attempts, audit_logs
  });

  it("reports zero changes when no rows match", async () => {
    const { cleanupExpiredRows } = await import("./maintenance.service");

    const db = new FakeD1Database({
      run: () => {
        return { success: true, meta: { changes: 0 } } as D1Result;
      },
    }) as unknown as D1Database;

    const result = await cleanupExpiredRows(db, Date.now());

    expect(result.sessions).toBe(0);
    expect(result.emailVerifications).toBe(0);
    expect(result.passwordResetTokens).toBe(0);
    expect(result.loginAttempts).toBe(0);
    expect(result.auditLogs).toBe(0);
  });

  it("accepts custom auditRetentionDays config", async () => {
    const { cleanupExpiredRows } = await import("./maintenance.service");
    const executedQueries: string[] = [];

    const db = new FakeD1Database({
      run: (sql) => {
        executedQueries.push(sql as string);
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
    }) as unknown as D1Database;

    await cleanupExpiredRows(db, Date.now(), { auditRetentionDays: 365 });

    const auditDelete = executedQueries.find((q) => q.includes("DELETE FROM audit_logs"));
    expect(auditDelete).toBeDefined();
  });
});
