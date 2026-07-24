import { describe, it, expect } from "vitest";
import { parseCsv, csvRowsToObjects, previewImport, type ImportValidator } from "./import.service";

describe("CSV parser", () => {
  it("parses basic CSV", () => {
    const result = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(result.headers).toEqual(["a", "b", "c"]);
    expect(result.rows).toEqual([["1", "2", "3"], ["4", "5", "6"]]);
  });

  it("handles quoted fields with commas", () => {
    const result2 = parseCsv(`name,desc\n"Foo, Bar","baz"`);
    expect(result2.rows[0]).toEqual(["Foo, Bar", "baz"]);
  });

  it("handles quoted fields with escaped quotes", () => {
    const result3 = parseCsv(`col\n"say ""hello"""`);
    expect(result3.rows[0]).toEqual(['say "hello"']);
  });

  it("handles CRLF line endings", () => {
    const result4 = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(result4.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("strips BOM", () => {
    const result5 = parseCsv("\uFEFFa,b\n1,2");
    expect(result5.headers).toEqual(["a", "b"]);
  });

  it("returns empty for empty input", () => {
    const { headers, rows } = parseCsv("");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe("csvRowsToObjects", () => {
  it("converts rows to objects", () => {
    const result = csvRowsToObjects(["kode", "nama"], [["1110", "Kas"], ["1120", "Bank"]]);
    expect(result).toEqual([
      { kode: "1110", nama: "Kas" },
      { kode: "1120", nama: "Bank" },
    ]);
  });

  it("handles missing fields", () => {
    const result = csvRowsToObjects(["a", "b"], [["1"]]);
    expect(result[0].b).toBe("");
  });
});

describe("previewImport", () => {
  const testValidator: ImportValidator<{ code: string; name: string }> = {
    name: "test",
    requiredHeaders: ["kode", "nama"],
    validateRow(row, idx) { void idx;
      const errors: { field: string; message: string }[] = [];
      const code = row["kode"]?.trim();
      const name = row["nama"]?.trim();
      if (!code) errors.push({ field: "kode", message: "kode harus diisi" });
      if (!name) errors.push({ field: "nama", message: "nama harus diisi" });
      if (!code || !name) return { parsed: null, errors };
      return { parsed: { code, name }, errors };
    },
  };

  it("returns preview for valid CSV", async () => {
    const result = await previewImport("kode,nama\n1110,Kas\n1120,Bank", testValidator);
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.errorRows).toBe(0);
  });

  it("reports missing required headers", async () => {
    const result = await previewImport("kode\n1110", testValidator);
    expect(result.totalRows).toBe(1);
    expect(result.errors.some((e) => e.message.includes("Header tidak ditemukan"))).toBe(true);
  });

  it("reports validation errors per row", async () => {
    const result = await previewImport("kode,nama\n1110,\n,Test", testValidator);
    expect(result.errorRows).toBe(2);
    expect(result.errors.length).toBe(2);
  });
});
