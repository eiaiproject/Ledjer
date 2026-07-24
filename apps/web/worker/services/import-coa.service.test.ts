import { describe, it, expect } from "vitest";
import { coaImportValidator } from "./import-coa.service";

describe("CoA Import Validator", () => {
  it("validates a valid CoA row", () => {
    const result = coaImportValidator.validateRow(
      { kode: "1110", nama: "Kas", tipe: "aset", normal_saldo: "debit" },
      0,
    );
    expect(result.parsed).not.toBeNull();
    expect(result.parsed?.code).toBe("1110");
    expect(result.parsed?.name).toBe("Kas");
    expect(result.parsed?.accountType).toBe("asset");
    expect(result.parsed?.normalBalance).toBe("debit");
  });

  it("accepts Indonesian account type names", () => {
    const types = [
      { input: "aset", expected: "asset" },
      { input: "kewajiban", expected: "liability" },
      { input: "ekuitas", expected: "equity" },
      { input: "pendapatan", expected: "revenue" },
      { input: "hpp", expected: "cogs" },
      { input: "beban", expected: "expense" },
      { input: "pendapatan_lain", expected: "other_income" },
      { input: "beban_lain", expected: "other_expense" },
    ];
    for (const t of types) {
      const result = coaImportValidator.validateRow(
        { kode: "9999", nama: "Test", tipe: t.input },
        0,
      );
      expect(result.parsed?.accountType).toBe(t.expected);
    }
  });

  it("infers normal balance from account type", () => {
    const asetResult = coaImportValidator.validateRow(
      { kode: "1110", nama: "Kas", tipe: "aset" },
      0,
    );
    expect(asetResult.parsed?.normalBalance).toBe("debit");

    const ekuitasResult = coaImportValidator.validateRow(
      { kode: "3100", nama: "Modal", tipe: "ekuitas" },
      0,
    );
    expect(ekuitasResult.parsed?.normalBalance).toBe("credit");
  });

  it("rejects unknown account type", () => {
    const result = coaImportValidator.validateRow(
      { kode: "9999", nama: "Test", tipe: "unknown_type" },
      0,
    );
    expect(result.parsed).toBeNull();
    expect(result.errors.some((e) => e.field === "tipe")).toBe(true);
  });

  it("requires kode and nama", () => {
    const result = coaImportValidator.validateRow(
      { kode: "", nama: "", tipe: "aset" },
      0,
    );
    expect(result.parsed).toBeNull();
    expect(result.errors.some((e) => e.field === "kode")).toBe(true);
    expect(result.errors.some((e) => e.field === "nama")).toBe(true);
  });

  it("parses cash account flag", () => {
    const result = coaImportValidator.validateRow(
      { kode: "1110", nama: "Kas", tipe: "aset", akun_kas: "ya", tipe_kas: "cash" },
      0,
    );
    expect(result.parsed?.isCashAccount).toBe(true);
    expect(result.parsed?.cashAccountType).toBe("cash");
  });

  it("parses parent code and report group", () => {
    const result = coaImportValidator.validateRow(
      { kode: "1111", nama: "Kas Kecil", tipe: "aset", kode_induk: "1110", grup_laporan: "current_assets" },
      0,
    );
    expect(result.parsed?.parentCode).toBe("1110");
    expect(result.parsed?.reportGroup).toBe("current_assets");
  });
});
