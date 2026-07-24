import { describe, it, expect } from "vitest";
import { partyImportValidator } from "./import-parties.service";

describe("Party Import Validator", () => {
  it("validates a valid party row", () => {
    const result = partyImportValidator.validateRow(
      { nama: "PT Maju Jaya", tipe: "customer", email: "info@maju.id", telepon: "021-1234" },
      0,
    );
    expect(result.parsed).not.toBeNull();
    expect(result.parsed?.name).toBe("PT Maju Jaya");
    expect(result.parsed?.partyType).toBe("customer");
    expect(result.parsed?.email).toBe("info@maju.id");
    expect(result.parsed?.phone).toBe("021-1234");
  });

  it("accepts Indonesian party types", () => {
    const cases = [
      { input: "pelanggan", expected: "customer" },
      { input: "pemasok", expected: "supplier" },
      { input: "karyawan", expected: "employee" },
      { input: "pemilik", expected: "owner" },
      { input: "lainnya", expected: "other" },
    ];
    for (const c of cases) {
      const result = partyImportValidator.validateRow(
        { nama: "Test", tipe: c.input },
        0,
      );
      expect(result.parsed?.partyType).toBe(c.expected);
    }
  });

  it("requires nama", () => {
    const result = partyImportValidator.validateRow({ nama: "" }, 0);
    expect(result.parsed).toBeNull();
    expect(result.errors.some((e) => e.field === "nama")).toBe(true);
  });

  it("defaults to other type when not specified", () => {
    const result = partyImportValidator.validateRow({ nama: "Test" }, 0);
    expect(result.parsed?.partyType).toBe("other");
  });

  it("rejects unknown party type", () => {
    const result = partyImportValidator.validateRow(
      { nama: "Test", tipe: "alien" },
      0,
    );
    expect(result.errors.some((e) => e.field === "tipe")).toBe(true);
  });
});
