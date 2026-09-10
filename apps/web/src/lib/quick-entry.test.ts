import { describe, expect, it } from "vitest";
import { buildDraft, matchProducts, parseQuickEntryText } from "./quick-entry";

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

describe("matchProducts", () => {
  const catalog = [
    { id: "p1", name: "Kopi Tubruk", unit: "pcs", is_active: 1, current_stock: 14 },
    { id: "p2", name: "Kopi Susu", unit: "pcs", is_active: 1, current_stock: 0 },
    { id: "p3", name: "Gula", unit: "kg", is_active: 0, current_stock: 9 },
  ];
  it("exact di atas mengandung", () => {
    expect(matchProducts("kopi", catalog, "purchase").map((c) => c.id)).toEqual(["p1", "p2"]);
  });
  it("jual menyembunyikan stok kosong dan nonaktif", () => {
    expect(matchProducts("kopi", catalog, "sale").map((c) => c.id)).toEqual(["p1"]);
  });
  it("toleran typo 1 huruf", () => {
    expect(matchProducts("kopy", catalog, "purchase").map((c) => c.id)).toEqual(["p1", "p2"]);
  });
});

describe("buildDraft", () => {
  it("menghitung total dari satuan dan menandai mismatch satuan", () => {
    const parsed = parseQuickEntryText("jual kopi 10kg 50000");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const draft = buildDraft(parsed, [
      { id: "p1", name: "Kopi", unit: "pcs", is_active: 1, current_stock: 14 },
    ]);
    expect(draft).toMatchObject({
      productId: "p1", quantity: 10, unitPriceIdr: 50000,
      totalIdr: 500000, unitMismatch: true,
    });
  });
  it("total eksplisit dipecah ke satuan dengan pembulatan", () => {
    const parsed = parseQuickEntryText("jual kopi 3pcs total 100000");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(buildDraft(parsed, [
      { id: "p1", name: "Kopi", unit: "pcs", is_active: 1, current_stock: 14 },
    ])).toMatchObject({ unitPriceIdr: 33333, totalIdr: 100000 });
  });
  it("produk tak dikenal → error ramah", () => {
    const parsed = parseQuickEntryText("jual zebra 1 10000");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(buildDraft(parsed, [])).toEqual({
      error: "Produk 'zebra' tidak ditemukan. Buat dulu di halaman Produk.",
    });
  });
});
