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

describe("parseQuickEntryText (varian harga)", () => {
  it.each([
    ["jual kopi 10pcs 50rb", 50000],
    ["jual kopi 10pcs 50 ribu", 50000],
    ["jual kopi 10pcs 50.000", 50000],
    ["jual kopi 10pcs 1,5jt", 1500000],
    ["beli gula 5kg 1juta", 1000000],
  ])("memahami %s", (text, price) => {
    const result = parseQuickEntryText(text);
    expect(result).toMatchObject({ ok: true, unitPriceIdr: price });
  });
  it("memahami qty desimal koma", () => {
    expect(parseQuickEntryText("beli gula 2,5kg 20000")).toMatchObject({
      ok: true, quantity: 2.5, unit: "kg", unitPriceIdr: 20000,
    });
  });
  it("memahami keyword total", () => {
    expect(parseQuickEntryText("jual kopi 10pcs total 500rb")).toMatchObject({
      ok: true, unitPriceIdr: undefined, totalIdr: 500000,
    });
  });
  it("menolak harga pecahan", () => {
    expect(parseQuickEntryText("jual kopi 10 50000.5").ok).toBe(false);
  });
});
