import { describe, expect, it } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import { csvEscape, toCsv } from "./exports.service";
import { cleanupExpiredRows } from "./maintenance.service";

describe("CSV escaping", () => {
  it("escapes delimiters, quotes, newlines, and spreadsheet formula prefixes", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe("line1 line2");
    expect(csvEscape("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvEscape("+CMD")).toBe("\"'+CMD\"");
    expect(csvEscape("-RC2")).toBe('"\'-RC2"');
    expect(csvEscape("@SUM")).toBe('"\'@SUM"');
    expect(csvEscape("\t=SUM(A1)")).toBe('"\'\t=SUM(A1)"');
  });

  it("serializes rows without leaving dangerous leading cells", () => {
    const csv = toCsv(["Nama", "Nilai"], [["Normal", 1], ["Formula", "=1+1"]]);

    expect(csv).toBe('Nama,Nilai\nNormal,1\nFormula,"\'=1+1"');
  });
});

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
