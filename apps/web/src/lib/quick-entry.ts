export type QuickEntryKind = "sale" | "purchase" | "expense" | "transfer" | "deposit" | "withdrawal" | "stock_loss";

export interface SalePurchaseParse {
  ok: true;
  kind: "sale" | "purchase";
  productQuery: string;
  quantity: number;
  unit?: string;
  unitPriceIdr?: number;
  totalIdr?: number;
  partyQuery?: string;
}

export interface ExpenseParse {
  ok: true;
  kind: "expense";
  description: string;
  amountIdr: number;
}

export interface MoneyParse {
  ok: true;
  kind: "transfer" | "deposit" | "withdrawal";
  amountIdr: number;
  note?: string;
}

export interface StockLossParse {
  ok: true;
  kind: "stock_loss";
  productQuery: string;
  quantity: number;
  unit?: string;
  reason: string;
}

/** "beli X nominal" tanpa qty: ambigu stok vs beban — UI wajib bertanya. */
export interface AmbiguousBuyParse {
  ok: true;
  kind: "ambiguous_buy";
  description: string;
  amountIdr: number;
}

export type QuickEntryParsed =
  | SalePurchaseParse
  | ExpenseParse
  | MoneyParse
  | StockLossParse
  | AmbiguousBuyParse;

export type QuickEntryParseResult = QuickEntryParsed | { ok: false; message: string };

const HELP = "Contoh: jual telur 30 butir ke Nadia 81rb";

/** Pengali sufiks harga, tanpa nested-ternary. */
const PRICE_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
};

export interface ProductLite {
  id: string;
  name: string;
  unit: string;
  is_active: number;
  current_stock: number;
}

export type QuickEntryDraftKind =
  | "sale" | "purchase" | "expense" | "transfer" | "deposit" | "withdrawal" | "stock_loss"
  | "ambiguous_buy";

export interface QuickEntryDraft {
  kind: QuickEntryDraftKind;
  productId?: string;
  candidates?: { id: string; name: string }[];
  partyQuery?: string;
  quantity?: number;
  unit?: string;
  unitMismatch?: boolean;
  unitPriceIdr?: number;
  totalIdr?: number;
  amountIdr?: number;
  description?: string;
  reason?: string;
  warnings: string[];
}

function normalizeName(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

/**
 * Kandidat produk terurut: exact > awalan > mengandung > typo kecil.
 * Jual: aktif + berstok. Beli: aktif (stok 0 boleh dibeli).
 */
export function matchProducts(
  query: string,
  products: ProductLite[],
  kind: "sale" | "purchase",
): { id: string; name: string }[] {
  const q = normalizeName(query);
  if (!q) return [];
  const eligible = products.filter((p) =>
    p.is_active === 1 && (kind === "purchase" || p.current_stock > 0),
  );
  const scored: { product: ProductLite; rank: number }[] = [];
  for (const product of eligible) {
    const name = normalizeName(product.name);
    let rank = -1;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (name.length >= 4) {
      const best = Math.min(...name.split(" ").map((word) => levenshtein(q, word)));
      if (best <= 2) rank = 3;
    }
    if (rank >= 0) scored.push({ product, rank });
  }
  scored.sort((a, b) => a.rank - b.rank);
  return scored.map((s) => ({ id: s.product.id, name: s.product.name }));
}
/**
 * Bangun draft pratinjau dari hasil parse.
 * sale/purchase: fuzzy-match produk, hitung total, tandai mismatch satuan.
 * expense/transfer/deposit/withdrawal/stock_loss: teruskan nominal/deskripsi
 * (pratinjau bisa dikonfirmasi langsung, tanpa katalog).
 */
export function buildDraft(
  parsed: QuickEntryParsed,
  products: ProductLite[],
): QuickEntryDraft | { error: string } {
  if (parsed.kind === "expense") {
    return { kind: "expense", amountIdr: parsed.amountIdr, description: parsed.description, warnings: [] };
  }
  if (parsed.kind === "ambiguous_buy") {
    return {
      kind: "ambiguous_buy",
      amountIdr: parsed.amountIdr,
      description: parsed.description,
      warnings: ["\"Beli\" tanpa jumlah — pilih Stok bila barang dagangan, Beban bila sekali pakai."],
    };
  }
  if (parsed.kind === "stock_loss") {
    const lossCandidates = matchProducts(parsed.productQuery, products, "sale");
    if (lossCandidates.length === 0) {
      return { error: `Produk '${parsed.productQuery}' tidak ditemukan. Buat dulu di halaman Produk.` };
    }
    const lossProduct = products.find((p) => p.id === lossCandidates[0].id)!;
    const lossWarnings: string[] = [];
    const lossMismatch = parsed.unit !== undefined && parsed.unit !== lossProduct.unit;
    if (lossMismatch) {
      lossWarnings.push(`Satuan diketik '${parsed.unit}', produk memakai '${lossProduct.unit}'.`);
    }
    return {
      kind: "stock_loss", productId: lossProduct.id, candidates: lossCandidates,
      quantity: parsed.quantity, unit: parsed.unit, unitMismatch: lossMismatch,
      reason: parsed.reason, warnings: lossWarnings,
    };
  }
  if (parsed.kind === "transfer" || parsed.kind === "deposit" || parsed.kind === "withdrawal") {
    return { kind: parsed.kind, amountIdr: parsed.amountIdr, description: parsed.note, warnings: [] };
  }
  if (parsed.kind !== "sale" && parsed.kind !== "purchase") {
    throw new Error(`buildDraft goods dipanggil untuk kind ${parsed.kind}`);
  }
  const candidates = matchProducts(parsed.productQuery, products, parsed.kind);
  if (candidates.length === 0) {
    return { error: `Produk '${parsed.productQuery}' tidak ditemukan. Buat dulu di halaman Produk.` };
  }
  const product = products.find((p) => p.id === candidates[0].id)!;
  const warnings: string[] = [];
  // Nominal ketikan adalah total yang tercatat; satuan hanya diturunkan presisi
  // (maks 4 desimal) sebagai patokan margin — tidak pernah dibulatkan ke rupiah.
  const totalIdr = parsed.totalIdr ?? parsed.quantity * parsed.unitPriceIdr!;
  const unitPriceIdr = Number((totalIdr / parsed.quantity).toFixed(4));
  const unitMismatch = parsed.unit !== undefined && parsed.unit !== product.unit;
  if (unitMismatch) {
    warnings.push(`Satuan diketik '${parsed.unit}', produk memakai '${product.unit}'.`);
  }
  return {
    kind: parsed.kind,
    productId: product.id,
    candidates,
    partyQuery: parsed.partyQuery,
    quantity: parsed.quantity,
    unit: parsed.unit,
    unitMismatch,
    unitPriceIdr,
    totalIdr,
    warnings,
  };
}

interface TakenPrice {
  totalIdr?: number;
  count: number;
}

/**
 * Ambil nominal TOTAL dari ujung kanan: "50000" (1 token) atau
 * "50 ribu"/"total 500rb" (2 token). Nominal polos selalu dibaca sebagai
 * total transaksi; harga satuan = total / jumlah (dihitung di buildDraft).
 */
function takePriceFromEnd(tokens: string[]): (TakenPrice & { ok: true }) | { ok: false } {
  const last = tokens.at(-1) ?? "";
  if (tokens.at(-2)?.toLowerCase() === "total") {
    const total = parsePriceToken(last);
    return total === null ? { ok: false } : { ok: true, totalIdr: total, count: 2 };
  }
  const single = parsePriceToken(last);
  if (single !== null) return { ok: true, totalIdr: single, count: 1 };
  const prev = tokens.at(-2);
  if (prev === undefined) return { ok: false };
  const joined = parsePriceToken(`${prev} ${last}`);
  return joined === null ? { ok: false } : { ok: true, totalIdr: joined, count: 2 };
}

/** Urai token qty: angka (desimal koma) + satuan opsional. */
function parseQtyToken(token: string): { quantity: number; unit?: string } | null {
  const match = /^([\d.,]+)([a-z]*)$/.exec(token.toLowerCase());
  if (!match) return null;
  const [, digits, unit] = match;
  if (!/^\d+([.,]\d+)?$/.test(digits)) return null;
  const quantity = Number(digits.replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return { quantity, unit: unit === "" ? undefined : unit };
}

/**
 * Ambil qty dari ujung kanan head: "10pcs" (1 token) atau "30 butir" (2 token).
 * Varian dua-token menangani "jual telur 30 butir ke Nadia 81rb".
 */
function takeQtyFromEnd(head: string[]): ({ quantity: number; unit?: string; count: number } & { ok: true }) | { ok: false } {
  const last = head.at(-1);
  if (last === undefined) return { ok: false };
  const single = parseQtyToken(last);
  if (single) return { ok: true, quantity: single.quantity, unit: single.unit, count: 1 };
  if (head.length >= 2) {
    const prev = head.at(-2) ?? "";
    const prevParsed = parseQtyToken(prev);
    if (prevParsed && prevParsed.unit === undefined && /^[a-z]+$/.test(last)) {
      return { ok: true, quantity: prevParsed.quantity, unit: last, count: 2 };
    }
  }
  return { ok: false };
}

function parsePriceToken(token: string): number | null {
  const cleaned = token.toLowerCase().replace(/\s+/g, "");
  // Regex linear (tanpa nested quantifier): digit lalu sisa huruf.
  const match = /^(\d[\d.,]*)([a-z]*)$/.exec(cleaned);
  if (!match) return null;
  const [, digits, suffix] = match;
  if (suffix !== "" && !(suffix in PRICE_MULTIPLIERS)) return null;
  // Titik hanya sah sebagai pemisah ribuan ("50.000", "1.500.000");
  // selain itu berarti desimal → rupiah tak bersisa → tolak.
  let plain = digits;
  if (plain.includes(".")) {
    const parts = plain.split(".");
    const validSep = parts.length > 1
      && /^\d+$/.test(parts[0])
      && parts.slice(1).every((g) => g.length === 3);
    if (!validSep) return null;
    plain = parts.join("");
  }
  const value = Number(plain.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const multiplier = suffix === "" ? 1 : PRICE_MULTIPLIERS[suffix];
  const result = value * multiplier;
  if (!Number.isInteger(result) || result <= 0) return null;
  return result;
}

export function parseQuickEntryText(text: string): QuickEntryParseResult {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  // Susut infix ("telur pecah 11 butir") dideteksi dulu sebelum kata kerja awal.
  const infixLoss = parseInfixStockLoss(normalized);
  if (infixLoss) return infixLoss;
  // Spasi sudah dinormalisasi tunggal → pola spasi literal (linear, tanpa backtracking).
  const verbMatch = /^(jual|beli|bayar|transfer|setor|ambil|pecah|rusak|konsumsi|hilang) (.+)$/.exec(normalized);
  if (!verbMatch) return { ok: false, message: HELP };
  const verb = verbMatch[1];
  const rest = verbMatch[2].replace(/^rp\s*/i, "");
  if (verb === "bayar") return parseExpense(rest);
  if (verb === "transfer") return parseMoneyOnly(rest, "transfer");
  if (verb === "setor") return parseMoneyOnly(rest, "deposit");
  if (verb === "ambil") return parseMoneyOnly(rest, "withdrawal");
  if (verb === "pecah" || verb === "rusak" || verb === "konsumsi" || verb === "hilang") {
    return parseStockLoss(verb, rest);
  }
  if (verb === "beli") {
    const goods = parseGoods("purchase", rest);
    if (goods.ok) return goods;
    // "beli X nominal" tanpa qty: ambigu produk vs beban → tanya, jangan tebak.
    return parseAmbiguousBuy(rest);
  }
  const goods = parseGoods("sale", rest);
  if (goods.ok) return goods;
  // Jual tanpa qty tapi ada nominal (mis. "jual telur ke Nadia 81rb"): tolak
  // dengan pesan spesifik — qty dan nominal wajib untuk harga satuan.
  const maybePrice = takePriceFromEnd(rest.split(" ").filter((t) => t !== ""));
  if (maybePrice.ok) {
    return { ok: false, message: "Tulis jumlah dan nominalnya, contoh: jual telur 30 butir 81rb" };
  }
  return goods;
}

/**
 * Susut infix: "[produk] pecah|rusak|konsumsi|hilang [qty] [unit]".
 * Contoh Ohmega: "telur pecah 11 butir".
 */
function parseInfixStockLoss(normalized: string): QuickEntryParseResult | null {
  const match = /^(.+) (pecah|rusak|konsumsi|hilang) (.+)$/.exec(normalized);
  if (!match) return null;
  const [, productQuery, verb, tail] = match;
  if (!productQuery.trim() || !tail.trim()) return null;
  const loss = parseStockLoss(verb, `${productQuery} ${tail}`);
  if (!loss.ok || loss.kind !== "stock_loss") return null;
  // parseStockLoss mengira kata kerja infix sebagai bagian produk ("telur pecah");
  // kupas kata kerja itu bila menempel di akhir query.
  if (loss.productQuery.endsWith(` ${verb}`)) {
    return { ...loss, productQuery: loss.productQuery.slice(0, -(verb.length + 1)) };
  }
  return loss;
}

/**
 * "beli mika telur 34500": tak ada qty → bukan pembelian stok.
 * Kembalikan ambiguous_buy agar UI menampilkan pilihan eksplisit
 * (stok vs beban) sebelum simpan — jangan menebak diam-diam.
 */
function parseAmbiguousBuy(rest: string): QuickEntryParseResult {
  const expense = parseExpense(rest);
  if (!expense.ok || expense.kind !== "expense") return { ok: false, message: HELP };
  return { ok: true, kind: "ambiguous_buy", description: expense.description, amountIdr: expense.amountIdr };
}

/**
 * Pisahkan klausa pihak dari kanan: "… ke Nadia" / "… dari Vitantri".
 * Mengembalikan sisa token + nama pihak (atau undefined bila tak ada).
 */
function splitParty(tokens: string[]): { head: string[]; partyQuery?: string } {
  const idxKe = tokens.lastIndexOf("ke");
  const idxDari = tokens.lastIndexOf("dari");
  const idx = Math.max(idxKe, idxDari);
  if (idx < 0 || idx === tokens.length - 1) return { head: tokens };
  // "ke"/"dari" di awal berarti bukan klausa pihak (tak ada subjek produk).
  if (idx === 0) return { head: tokens };
  return { head: tokens.slice(0, idx), partyQuery: tokens.slice(idx + 1).join(" ") };
}

/** Kata pengisi yang diabaikan dalam urutan nominal-dulu ("dapat 251 butir"). */
const FILLER_TOKENS = new Set(["dapat", "dpt"]);

/** Badan usaha yang selalu huruf besar semua bila diketik kecil. */
const PARTY_ACRONYMS = new Set(["pt", "cv", "ud", "pd", "fa", "tbk"]);

/**
 * Ambil ejaan asli pihak dari teks ketikan (parser bekerja lowercase sehingga
 * partyQuery selalu kecil). Cari dari penanda ke/dari terakhir agar kemunculan
 * di nama produk tidak ikut terambil. Fallback ke query bila tak cocok
 * (spasi ganda / Unicode panjang-berubah seperti İ).
 */
export function extractOriginalParty(text: string, partyQueryLower: string): string {
  const lowered = text.toLowerCase();
  const markerIdx = Math.max(lowered.lastIndexOf(" ke "), lowered.lastIndexOf(" dari "));
  const from = Math.max(markerIdx, 0);
  const idx = lowered.indexOf(partyQueryLower, from);
  if (idx < 0) return partyQueryLower;
  const slice = text.slice(idx, idx + partyQueryLower.length);
  if (slice.toLowerCase() !== partyQueryLower) return partyQueryLower;
  return slice;
}

/** Pertahankan kapital ketikan, tapi paksa akronim badan usaha jadi kapital semua. */
export function normalizePartyName(name: string): string {
  return name
    .split(" ")
    .map((w) => (PARTY_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w))
    .join(" ");
}

/**
 * Ambil ejaan asli potongan query dari teks ketikan (tanpa patokan penanda).
 * Dipakai untuk nama produk baru agar "Kopi" tidak tersimpan "kopi".
 */
export function extractOriginalText(text: string, queryLower: string, from = 0): string {
  const lowered = text.toLowerCase();
  const idx = lowered.indexOf(queryLower, from);
  if (idx < 0) return queryLower;
  const slice = text.slice(idx, idx + queryLower.length);
  if (slice.toLowerCase() !== queryLower) return queryLower;
  return slice;
}

/** Sufiks yang bermakna nominal — tidak boleh dibaca sebagai satuan qty. */
const PRICE_SUFFIXES = new Set(Object.keys(PRICE_MULTIPLIERS));

/**
 * Pecah klausa pihak secara ketat: ke/dari harus punya tetangga di kedua sisi.
 * Beda dengan splitParty (longgar, untuk urutan kanonik): versi ini mengembalikan
 * null bila tidak ada pihak di tengah, agar urutan lain bisa dicoba.
 */
function splitPartyStrict(tokens: string[]): { product: string; partyQuery: string; index: number } | null {
  const idxKe = tokens.lastIndexOf("ke");
  const idxDari = tokens.lastIndexOf("dari");
  const idx = Math.max(idxKe, idxDari);
  if (idx <= 0 || idx === tokens.length - 1) return null;
  const product = tokens.slice(0, idx).join(" ").trim();
  const partyQuery = tokens.slice(idx + 1).join(" ").trim();
  if (!product || !partyQuery) return null;
  return { product, partyQuery, index: idx };
}

function makeGoods(
  kind: "sale" | "purchase",
  productQuery: string,
  partyQuery: string | undefined,
  quantity: number,
  unit: string | undefined,
  totalIdr: number,
): SalePurchaseParse {
  return { ok: true, kind, productQuery, partyQuery, quantity, unit, unitPriceIdr: undefined, totalIdr };
}

/** A (kanonik): [produk] [qty] [unit] [ke/dari pihak] [nominal]. */
function tryCanonical(kind: "sale" | "purchase", tokens: string[]): SalePurchaseParse | null {
  const taken = takePriceFromEnd(tokens);
  if (!taken.ok) return null;
  const beforePrice = tokens.slice(0, -taken.count);
  const { head, partyQuery } = splitParty(beforePrice);
  if (head.length < 2) return null;
  const parsedQty = takeQtyFromEnd(head);
  if (!parsedQty.ok) return null;
  const productQuery = head.slice(0, -parsedQty.count).join(" ").trim();
  if (!productQuery || taken.totalIdr === undefined) return null;
  return makeGoods(kind, productQuery, partyQuery, parsedQty.quantity, parsedQty.unit, taken.totalIdr);
}

/** D (pihak di ujung): [produk] [qty] [unit] [nominal] ke/dari [pihak]. */
function tryPartyLast(kind: "sale" | "purchase", tokens: string[]): SalePurchaseParse | null {
  const split = splitPartyStrict(tokens);
  if (!split) return null;
  const front = tokens.slice(0, split.index);
  const taken = takePriceFromEnd(front);
  if (!taken.ok || taken.totalIdr === undefined) return null;
  const beforePrice = front.slice(0, -taken.count);
  if (beforePrice.length < 2) return null;
  const parsedQty = takeQtyFromEnd(beforePrice);
  if (!parsedQty.ok) return null;
  const productQuery = beforePrice.slice(0, -parsedQty.count).join(" ").trim();
  if (!productQuery) return null;
  return makeGoods(kind, productQuery, split.partyQuery, parsedQty.quantity, parsedQty.unit, taken.totalIdr);
}

/** C (pihak di tengah, nominal di ujung): [produk] ke/dari [pihak] [qty] [unit] [nominal]. */
function tryPriceLastMiddleParty(kind: "sale" | "purchase", tokens: string[]): SalePurchaseParse | null {
  const taken = takePriceFromEnd(tokens);
  if (!taken.ok || taken.totalIdr === undefined) return null;
  const mid = tokens.slice(0, -taken.count);
  const parsedQty = takeQtyFromEnd(mid);
  if (!parsedQty.ok) return null;
  const front = mid.slice(0, -parsedQty.count);
  const split = splitPartyStrict(front);
  if (!split) return null;
  return makeGoods(kind, split.product, split.partyQuery, parsedQty.quantity, parsedQty.unit, taken.totalIdr);
}

/** B (nominal di tengah, qty di ujung): [produk] [ke/dari pihak] [nominal] [qty] [unit]. */
function tryQtyLast(kind: "sale" | "purchase", tokens: string[]): SalePurchaseParse | null {
  const parsedQty = takeQtyFromEnd(tokens);
  if (!parsedQty.ok) return null;
  // "81rb" di ujung adalah nominal, bukan qty 81 "rb".
  if (parsedQty.unit !== undefined && PRICE_SUFFIXES.has(parsedQty.unit)) return null;
  // Qty tanpa satuan ("... 495000 251") tak bisa dibedakan dari nominal —
  // ordo ini wajib menulis satuannya ("dapat 251 butir").
  if (parsedQty.unit === undefined) return null;
  const mid = tokens.slice(0, -parsedQty.count);
  const taken = takePriceFromEnd(mid);
  if (!taken.ok || taken.totalIdr === undefined) return null;
  const front = mid.slice(0, -taken.count);
  if (front.length === 0) return null;
  const split = splitPartyStrict(front);
  const productQuery = (split ? split.product : front.join(" ")).trim();
  if (!productQuery) return null;
  return makeGoods(kind, productQuery, split?.partyQuery, parsedQty.quantity, parsedQty.unit, taken.totalIdr);
}

/** Ambil qty dari depan: "250" (1 token) atau "250 butir" (2 token). */
function takeQtyFromFront(tokens: string[]): ({ quantity: number; unit?: string; count: number } & { ok: true }) | { ok: false } {
  if (tokens.length === 0) return { ok: false };
  const single = parseQtyToken(tokens[0]);
  if (!single) return { ok: false };
  if (single.unit !== undefined) return { ok: true, quantity: single.quantity, unit: single.unit, count: 1 };
  if (tokens.length >= 2 && /^[a-z]+$/.test(tokens[1]) && !PRICE_SUFFIXES.has(tokens[1])) {
    return { ok: true, quantity: single.quantity, unit: tokens[1], count: 2 };
  }
  return { ok: true, quantity: single.quantity, unit: undefined, count: 1 };
}

/** E (qty di depan): [qty] [unit] [produk] [ke/dari pihak] [nominal]. */
function tryQtyFirst(kind: "sale" | "purchase", tokens: string[]): SalePurchaseParse | null {
  const parsedQty = takeQtyFromFront(tokens);
  if (!parsedQty.ok) return null;
  const rest = tokens.slice(parsedQty.count);
  const taken = takePriceFromEnd(rest);
  if (!taken.ok || taken.totalIdr === undefined) return null;
  const front = rest.slice(0, -taken.count);
  if (front.length === 0) return null;
  const split = splitPartyStrict(front);
  const productQuery = (split ? split.product : front.join(" ")).trim();
  if (!productQuery) return null;
  return makeGoods(kind, productQuery, split?.partyQuery, parsedQty.quantity, parsedQty.unit, taken.totalIdr);
}

/** F (pihak di depan, 1 kata): ke/dari [pihak] [produk] [qty] [unit] [nominal]. */
function tryPartyFirst(kind: "sale" | "purchase", tokens: string[]): SalePurchaseParse | null {
  const partyQuery = tokens[1]?.trim();
  const rest = tokens.slice(2);
  if (!partyQuery || rest.length < 3) return null;
  const taken = takePriceFromEnd(rest);
  if (!taken.ok || taken.totalIdr === undefined) return null;
  const mid = rest.slice(0, -taken.count);
  if (mid.length < 2) return null;
  const parsedQty = takeQtyFromEnd(mid);
  if (!parsedQty.ok) return null;
  const productQuery = mid.slice(0, -parsedQty.count).join(" ").trim();
  if (!productQuery) return null;
  return makeGoods(kind, productQuery, partyQuery, parsedQty.quantity, parsedQty.unit, taken.totalIdr);
}

/**
 * Parser jual/beli — mencoba beberapa urutan kata (A kanonik dulu agar nama
 * produk berangka tetap aman, lalu D, C, B, E; F khusus pihak-di-depan).
 * Nominal polos selalu total; satuan = total / jumlah.
 */
function parseGoods(kind: "sale" | "purchase", rest: string): QuickEntryParseResult {
  // Nominal boleh didahului "sejumlah"/"total"/"rp"/"seharga" — samakan jadi "total".
  const prepared = rest.replace(/\b(sejumlah|seharga|senilai|rp)\b/g, "total");
  const raw = prepared.split(" ").filter((t) => t !== "");
  if (raw.length < 3) return { ok: false, message: HELP };
  const tokens = raw.filter((t) => !FILLER_TOKENS.has(t));
  if (tokens.length < 3) return { ok: false, message: HELP };
  // Pihak di depan ("dari Budi telur ...") ditangani jalurnya sendiri karena
  // urutan kanonik akan menelannya jadi nama produk.
  if (tokens[0] === "ke" || tokens[0] === "dari") {
    return tryPartyFirst(kind, tokens) ?? { ok: false, message: HELP };
  }
  return tryCanonical(kind, tokens)
    ?? tryPartyLast(kind, tokens)
    ?? tryPriceLastMiddleParty(kind, tokens)
    ?? tryQtyLast(kind, tokens)
    ?? tryQtyFirst(kind, tokens)
    ?? { ok: false, message: HELP };
}

/** Parser beban: "bayar [keterangan] [nominal]" atau "beli [non-produk] [nominal]". */
function parseExpense(rest: string): QuickEntryParseResult {
  const tokens = rest.split(" ").filter((t) => t !== "");
  if (tokens.length < 2) return { ok: false, message: HELP };
  const taken = takePriceFromEnd(tokens);
  if (!taken.ok) return { ok: false, message: HELP };
  const amountIdr = taken.totalIdr;
  if (amountIdr === undefined) return { ok: false, message: HELP };
  const description = tokens.slice(0, -taken.count).join(" ").trim();
  if (!description) return { ok: false, message: HELP };
  return { ok: true, kind: "expense", description, amountIdr };
}

/** Parser kas: "transfer/setor/ambil [keterangan?] [nominal]". */
function parseMoneyOnly(rest: string, kind: "transfer" | "deposit" | "withdrawal"): QuickEntryParseResult {
  const tokens = rest.split(" ").filter((t) => t !== "");
  if (tokens.length < 1) return { ok: false, message: HELP };
  const taken = takePriceFromEnd(tokens);
  if (!taken.ok) return { ok: false, message: HELP };
  const amountIdr = taken.totalIdr;
  if (amountIdr === undefined) return { ok: false, message: HELP };
  const note = tokens.slice(0, -taken.count).join(" ").trim() || undefined;
  return { ok: true, kind, amountIdr, note };
}

/** Parser susut: "[produk] pecah/rusak [qty] [unit]" atau "pecah [produk] [qty]". */
function parseStockLoss(verb: string, rest: string): QuickEntryParseResult {
  const tokens = rest.split(" ").filter((t) => t !== "");
  if (tokens.length < 2) return { ok: false, message: HELP };
  const parsedQty = takeQtyFromEnd(tokens);
  if (!parsedQty.ok) return { ok: false, message: HELP };
  const productQuery = tokens.slice(0, -parsedQty.count).join(" ").trim();
  if (!productQuery) return { ok: false, message: HELP };
  const reason = verb === "pecah" ? "pecah" : verb;
  return { ok: true, kind: "stock_loss", productQuery, quantity: parsedQty.quantity, unit: parsedQty.unit, reason };
}
