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

export function parseQuickEntryText(text: string): QuickEntryParseResult {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  const verbMatch = /^(jual|beli)\s+(.+)$/.exec(normalized);
  if (!verbMatch) return { ok: false, message: HELP };
  const kind = verbMatch[1] === "jual" ? "sale" : "purchase";
  const rest = verbMatch[2].replace(/^rp\s*/i, "");
  const tailMatch = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-z]*)\s+(\d+)\s*$/.exec(rest);
  if (!tailMatch) return { ok: false, message: HELP };
  const productQuery = tailMatch[1].trim();
  const quantity = Number(tailMatch[2].replace(",", "."));
  const unit = tailMatch[3] === "" ? undefined : tailMatch[3];
  const unitPriceIdr = Number(tailMatch[4]);
  if (!productQuery || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: HELP };
  }
  if (!Number.isInteger(unitPriceIdr) || unitPriceIdr <= 0) {
    return { ok: false, message: HELP };
  }
  return { ok: true, kind, productQuery, quantity, unit, unitPriceIdr, totalIdr: undefined };
}
