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

function parsePriceToken(token: string): number | null {
  const cleaned = token.toLowerCase().replace(/\s+/g, "");
  const match = /^(\d+(?:[.,]\d+)?)(rb|ribu|jt|juta)?$/.exec(cleaned);
  if (!match) return null;
  const [, digits, suffix] = match;
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
  const multiplier = suffix === "jt" || suffix === "juta" ? 1_000_000
    : suffix === "rb" || suffix === "ribu" ? 1_000 : 1;
  const result = value * multiplier;
  return Number.isInteger(result) ? result : null;
}

export function parseQuickEntryText(text: string): QuickEntryParseResult {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  const verbMatch = /^(jual|beli)\s+(.+)$/.exec(normalized);
  if (!verbMatch) return { ok: false, message: HELP };
  const kind = verbMatch[1] === "jual" ? "sale" : "purchase";
  const rest = verbMatch[2].replace(/^rp\s*/i, "");
  const tailMatch = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-z]*)\s+(.+?)\s*$/.exec(rest);
  if (!tailMatch) return { ok: false, message: HELP };
  const productQuery = tailMatch[1].trim();
  const quantity = Number(tailMatch[2].replace(",", "."));
  const unit = tailMatch[3] === "" ? undefined : tailMatch[3];
  if (!productQuery || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: HELP };
  }
  const pricePart = tailMatch[4].trim();
  const totalMatch = /^total\s+(.+)$/i.exec(pricePart);
  if (totalMatch) {
    const totalIdr = parsePriceToken(totalMatch[1]);
    if (totalIdr === null || totalIdr <= 0) return { ok: false, message: HELP };
    return { ok: true, kind, productQuery, quantity, unit, unitPriceIdr: undefined, totalIdr };
  }
  const unitPriceIdr = parsePriceToken(pricePart);
  if (unitPriceIdr === null || unitPriceIdr <= 0) return { ok: false, message: HELP };
  return { ok: true, kind, productQuery, quantity, unit, unitPriceIdr, totalIdr: undefined };
}
