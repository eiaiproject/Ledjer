export type QuickEntryParseResult =
  | {
      ok: true;
      kind: "sale" | "purchase";
      productQuery: string;
      quantity: number;
      unit?: string;
      unitPriceIdr?: number;
      totalIdr?: number;
    }
  | { ok: false; message: string };

const HELP = "Contoh: jual kopi 10pcs 50000";

/** Pengali sufiks harga, tanpa nested-ternary. */
const PRICE_MULTIPLIERS: Record<string, number> = {
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

export interface QuickEntryDraft {
  kind: "sale" | "purchase";
  productId: string;
  candidates: { id: string; name: string }[];
  quantity: number;
  unit?: string;
  unitMismatch: boolean;
  unitPriceIdr: number;
  totalIdr: number;
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

export function buildDraft(
  parsed: Extract<QuickEntryParseResult, { ok: true }>,
  products: ProductLite[],
): QuickEntryDraft | { error: string } {
  const candidates = matchProducts(parsed.productQuery, products, parsed.kind);
  if (candidates.length === 0) {
    return { error: `Produk '${parsed.productQuery}' tidak ditemukan. Buat dulu di halaman Produk.` };
  }
  const product = products.find((p) => p.id === candidates[0].id)!;
  const warnings: string[] = [];
  let unitPriceIdr: number;
  let totalIdr: number;
  if (parsed.totalIdr !== undefined) {
    totalIdr = parsed.totalIdr;
    unitPriceIdr = Math.round(totalIdr / parsed.quantity);
    if (unitPriceIdr * parsed.quantity !== totalIdr) {
      warnings.push(`Total tidak habis dibagi: satuan dibulatkan ke ${unitPriceIdr}.`);
    }
  } else {
    unitPriceIdr = parsed.unitPriceIdr!;
    totalIdr = parsed.quantity * unitPriceIdr;
  }
  const unitMismatch = parsed.unit !== undefined && parsed.unit !== product.unit;
  if (unitMismatch) {
    warnings.push(`Satuan diketik '${parsed.unit}', produk memakai '${product.unit}'.`);
  }
  return {
    kind: parsed.kind,
    productId: product.id,
    candidates,
    quantity: parsed.quantity,
    unit: parsed.unit,
    unitMismatch,
    unitPriceIdr,
    totalIdr,
    warnings,
  };
}

interface TakenPrice {
  unitPriceIdr?: number;
  totalIdr?: number;
  count: number;
}

/** Ambil harga dari ujung kanan: "50000" (1 token) atau "50 ribu"/"total 500rb" (2 token). */
function takePriceFromEnd(tokens: string[]): (TakenPrice & { ok: true }) | { ok: false } {
  const last = tokens.at(-1) ?? "";
  if (tokens.at(-2)?.toLowerCase() === "total") {
    const total = parsePriceToken(last);
    return total === null ? { ok: false } : { ok: true, totalIdr: total, count: 2 };
  }
  const single = parsePriceToken(last);
  if (single !== null) return { ok: true, unitPriceIdr: single, count: 1 };
  const prev = tokens.at(-2);
  if (prev === undefined) return { ok: false };
  const joined = parsePriceToken(`${prev} ${last}`);
  return joined === null ? { ok: false } : { ok: true, unitPriceIdr: joined, count: 2 };
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
  const verbMatch = /^(jual|beli)\s+(.+)$/.exec(normalized);
  if (!verbMatch) return { ok: false, message: HELP };
  const kind = verbMatch[1] === "jual" ? "sale" : "purchase";
  const rest = verbMatch[2].replace(/^rp\s*/i, "");
  // Parse dari KANAN (right-anchored): nama produk boleh mengandung angka
  // ("Produk QE 1788999999"), jadi harga = token terakhir, qty = sebelumnya.
  const tokens = rest.split(" ").filter((t) => t !== "");
  if (tokens.length < 3) return { ok: false, message: HELP };
  // Harga dan qty dari kanan via helper (complexity rendah, regex linear).
  const taken = takePriceFromEnd(tokens);
  if (!taken.ok) return { ok: false, message: HELP };
  const parsedQty = parseQtyToken(tokens.at(-taken.count - 1) ?? "");
  if (!parsedQty) return { ok: false, message: HELP };
  const productQuery = tokens.slice(0, -taken.count - 1).join(" ").trim();
  if (!productQuery) return { ok: false, message: HELP };
  return {
    ok: true, kind, productQuery,
    quantity: parsedQty.quantity, unit: parsedQty.unit,
    unitPriceIdr: taken.unitPriceIdr, totalIdr: taken.totalIdr,
  };
}
