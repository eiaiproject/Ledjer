import { describe, expect, it } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import type { D1Database } from "@cloudflare/workers-types";
import { cleanupExpiredRows } from "./maintenance.service";

describe("maintenance cleanup", () => {
  it("deletes expired sessions, audit logs, and rate limits", async () => {
    const db = new FakeD1Database({
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    });
    const result = await cleanupExpiredRows(db as unknown as D1Database, 12345);

    expect(result).toEqual({
      sessions: 1,
      auditLogs: 1,
      rateLimits: 1,
    });
    expect(db.statements).toHaveLength(3);
    expect(db.statements.map((statement) => statement.sql)).toEqual([
      expect.stringContaining("DELETE FROM sessions"),
      expect.stringContaining("DELETE FROM audit_logs"),
      expect.stringContaining("DELETE FROM rate_limits"),
    ]);
  });
});