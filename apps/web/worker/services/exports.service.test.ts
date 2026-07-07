import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "./exports.service";
import { cleanupExpiredRows } from "./maintenance.service";

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.values = values;
    return this;
  }

  async run(): Promise<D1Result> {
    return this.db.run(this.sql, this.values);
  }
}

class FakeD1Database {
  public statements: { sql: string; values: unknown[] }[] = [];

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  run(sql: string, values: unknown[]): D1Result {
    this.statements.push({ sql, values });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
}

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
  it("deletes expired sessions, tokens, and export jobs", async () => {
    const db = new FakeD1Database();
    const result = await cleanupExpiredRows(db as unknown as D1Database, 12345);

    expect(result).toEqual({
      sessions: 1,
      emailVerifications: 1,
      passwordResetTokens: 1,
      exportJobs: 1,
    });
    expect(db.statements).toHaveLength(4);
    expect(db.statements.map((statement) => statement.sql)).toEqual([
      expect.stringContaining("DELETE FROM sessions"),
      expect.stringContaining("DELETE FROM email_verifications"),
      expect.stringContaining("DELETE FROM password_reset_tokens"),
      expect.stringContaining("DELETE FROM export_jobs"),
    ]);
  });
});
