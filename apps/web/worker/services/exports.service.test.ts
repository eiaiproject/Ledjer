import { describe, expect, it } from "vitest";
import { csvEscape, exportTransactionsCsv, toCsv } from "./exports.service";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";

describe("exportTransactionsCsv status handling", () => {
  it("exports ALL statuses by default - matches the list view's 'Semua status'", async () => {
    const { db } = createSeedFixtures();
    const result = await exportTransactionsCsv(db as unknown as D1Database, FIXTURE_IDS.orgs.a, {});

    // Org A fixtures: 5 posted + 1 voided.
    expect(result.totalRows).toBe(6);
    expect(result.csv).toContain("TRX-20260705-LM12"); // voided row present
    expect(result.csv).toContain(",voided,");
  });

  it("exports posted-only when an explicit status filter is given", async () => {
    const { db } = createSeedFixtures();
    const result = await exportTransactionsCsv(db as unknown as D1Database, FIXTURE_IDS.orgs.a, {
      status: "posted",
    });

    expect(result.totalRows).toBe(5);
    expect(result.csv).not.toContain("TRX-20260705-LM12");
    expect(result.csv).not.toContain(",voided,");
  });

  it("exports voided-only when status=voided", async () => {
    const { db } = createSeedFixtures();
    const result = await exportTransactionsCsv(db as unknown as D1Database, FIXTURE_IDS.orgs.a, {
      status: "voided",
    });

    expect(result.totalRows).toBe(1);
    expect(result.csv).toContain("TRX-20260705-LM12");
  });
});

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

