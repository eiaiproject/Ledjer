import { describe, expect, it } from "vitest";
import { parseQuickEntryText } from "./quick-entry";

describe("parseQuickEntryText (inti)", () => {
  it("memahami jual dengan qty dan harga satuan", () => {
    expect(parseQuickEntryText("jual kopi 10pcs 50000")).toEqual({
      ok: true, kind: "sale", productQuery: "kopi",
      quantity: 10, unit: "pcs", unitPriceIdr: 50000, totalIdr: undefined,
    });
  });
  it("memahami beli tanpa satuan", () => {
    expect(parseQuickEntryText("Beli gula 5 20000")).toEqual({
      ok: true, kind: "purchase", productQuery: "gula",
      quantity: 5, unit: undefined, unitPriceIdr: 20000, totalIdr: undefined,
    });
  });
  it("menolak kata kerja asing dengan pesan contoh", () => {
    expect(parseQuickEntryText("makan kopi 10 50000")).toEqual({
      ok: false, message: "Contoh: jual kopi 10pcs 50000",
    });
  });
  it("menolak qty nol", () => {
    expect(parseQuickEntryText("jual kopi 0 50000").ok).toBe(false);
  });
});
