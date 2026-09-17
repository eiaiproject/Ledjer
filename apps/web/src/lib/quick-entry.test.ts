import { describe, expect, it } from "vitest";
import { buildDraft, matchProducts, parseQuickEntryText } from "./quick-entry";

describe("parseQuickEntryText (inti)", () => {
  it("memahami jual dengan qty dan nominal total", () => {
    expect(parseQuickEntryText("jual kopi 10pcs 50000")).toEqual({
      ok: true, kind: "sale", productQuery: "kopi",
      quantity: 10, unit: "pcs", unitPriceIdr: undefined, totalIdr: 50000,
    });
  });
  it("memahami beli tanpa satuan", () => {
    expect(parseQuickEntryText("Beli gula 5 20000")).toEqual({
      ok: true, kind: "purchase", productQuery: "gula",
      quantity: 5, unit: undefined, unitPriceIdr: undefined, totalIdr: 20000,
    });
  });
  it("menolak kata kerja asing dengan pesan contoh", () => {
    expect(parseQuickEntryText("makan kopi 10 50000")).toEqual({
      ok: false, message: "Contoh: jual telur 30 butir ke Nadia 81rb",
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
    expect(result).toMatchObject({ ok: true, totalIdr: price });
  });
  it("memahami qty desimal koma", () => {
    expect(parseQuickEntryText("beli gula 2,5kg 20000")).toMatchObject({
      ok: true, quantity: 2.5, unit: "kg", totalIdr: 20000,
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
  it("menurunkan satuan dari total dan menandai mismatch satuan", () => {
    const parsed = parseQuickEntryText("jual kopi 10kg 50000");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const draft = buildDraft(parsed, [
      { id: "p1", name: "Kopi", unit: "pcs", is_active: 1, current_stock: 14 },
    ]);
    expect(draft).toMatchObject({
      productId: "p1", quantity: 10, unitPriceIdr: 5000,
      totalIdr: 50000, unitMismatch: true,
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

describe("parseQuickEntryText (nama berangka)", () => {
  it("nama produk boleh mengandung angka", () => {
    expect(parseQuickEntryText("jual produk qe 1788999999 2pcs 50000")).toMatchObject({
      ok: true, kind: "sale", productQuery: "produk qe 1788999999",
      quantity: 2, unit: "pcs", totalIdr: 50000,
    });
  });
  it("nama berakhiran kata total tetap utuh", () => {
    expect(parseQuickEntryText("jual mie total 2pcs 50000")).toMatchObject({
      ok: true, productQuery: "mie total", quantity: 2, totalIdr: 50000,
    });
  });
});

describe("parseQuickEntryText (Ohmega chat-first)", () => {
  it("jual ke pihak dengan sejumlah nominal total", () => {
    expect(parseQuickEntryText("jual telur 30 butir ke Nadia 81rb")).toMatchObject({
      ok: true, kind: "sale", productQuery: "telur",
      quantity: 30, unit: "butir", partyQuery: "nadia", totalIdr: 81000,
    });
  });
  it("beli dari supplier dengan total nominal", () => {
    expect(parseQuickEntryText("beli telur 251 butir dari Vitantri 495rb")).toMatchObject({
      ok: true, kind: "purchase", productQuery: "telur",
      quantity: 251, unit: "butir", partyQuery: "vitantri", totalIdr: 495000,
    });
  });
  it("bayar beban tanpa produk", () => {
    expect(parseQuickEntryText("bayar stiker brand 16rb")).toMatchObject({
      ok: true, kind: "expense", description: "stiker brand", amountIdr: 16000,
    });
  });
  it("beli non-produk tanpa qty meminta pilihan eksplisit, bukan menebak", () => {
    expect(parseQuickEntryText("beli mika telur 34500")).toMatchObject({
      ok: true, kind: "ambiguous_buy", description: "mika telur", amountIdr: 34500,
    });
  });
  it("susut non-kas tanpa nominal", () => {
    expect(parseQuickEntryText("telur pecah 11 butir")).toMatchObject({
      ok: true, kind: "stock_loss", productQuery: "telur",
      quantity: 11, unit: "butir",
    });
  });
  it("transfer setor ambil hanya butuh nominal", () => {
    expect(parseQuickEntryText("transfer 500rb")).toMatchObject({ ok: true, kind: "transfer", amountIdr: 500000 });
    expect(parseQuickEntryText("setor 1jt")).toMatchObject({ ok: true, kind: "deposit", amountIdr: 1000000 });
    expect(parseQuickEntryText("ambil 250rb")).toMatchObject({ ok: true, kind: "withdrawal", amountIdr: 250000 });
  });
  it("beli ambigu tanpa harga cukup jelas untuk ditanya, bukan ditebak", () => {
    const result = parseQuickEntryText("beli telur");
    expect(result.ok).toBe(false);
  });
});
