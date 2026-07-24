import { describe, it, expect } from "vitest";
import { productImportValidator } from "./import-products.service";

describe("Product Import Validator", () => {
  it("validates a valid product row", () => {
    const result = productImportValidator.validateRow(
      { kode: "PRD-001", nama: "Widget A", satuan: "pcs", harga_beli: "50000", harga_jual: "100000", stok_minimum: "10" },
      0,
    );
    expect(result.parsed).not.toBeNull();
    expect(result.parsed?.code).toBe("PRD-001");
    expect(result.parsed?.name).toBe("Widget A");
    expect(result.parsed?.unit).toBe("pcs");
    expect(result.parsed?.purchasePriceMinor).toBe(50000);
    expect(result.parsed?.sellingPriceMinor).toBe(100000);
    expect(result.parsed?.minStockMilli).toBe(10);
  });

  it("requires kode and nama", () => {
    const result = productImportValidator.validateRow(
      { kode: "", nama: "", satuan: "pcs" },
      0,
    );
    expect(result.parsed).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("defaults unit to pcs", () => {
    const result = productImportValidator.validateRow(
      { kode: "PRD-002", nama: "Widget B" },
      0,
    );
    expect(result.parsed?.unit).toBe("pcs");
  });

  it("accepts optional fields as empty", () => {
    const result = productImportValidator.validateRow(
      { kode: "PRD-003", nama: "Widget C" },
      0,
    );
    expect(result.parsed?.description).toBeNull();
    expect(result.parsed?.purchasePriceMinor).toBeNull();
    expect(result.parsed?.sellingPriceMinor).toBeNull();
  });
});
