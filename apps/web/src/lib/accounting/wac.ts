/**
 * Weighted-Average Cost (WAC) calculations — isomorphic.
 *
 * Diekstrak dari products.service.ts agar bisa dipakai di kedua sisi:
 * - Client: hitung WAC lokal saat user beli/jual barang
 * - Server: verifikasi/override WAC saat sync
 *
 * Semua fungsi PURE — tidak ada dependensi DB atau I/O.
 *
 * Konversi satuan:
 * - qtyMilli = jumlah × 1000 (stok dalam miligram produk)
 * - unitCostMinor = harga per satuan × 10.000 (dalam minor unit)
 * - WAC = (stockMilli × wacMinor) / newStockMilli
 */

/**
 * HPP (COGS) IDR dari jumlah (milli) × harga pokok rata-rata (minor):
 * qty/1000 satuan × wac/10.000 IDR = qtyMilli × wacMinor / 10^7.
 * BigInt dipakai agar tidak meluap untuk stok/harga besar.
 */
export function cogsFromMilliWac(qtyMilli: number, wacMinor: number): number {
  return Number((BigInt(qtyMilli) * BigInt(wacMinor) + 5_000_000n) / 10_000_000n);
}

/**
 * WAC baru setelah pembelian: (stok×wac + qty×harga) / stok baru.
 * BigInt dengan half-up rounding agar sisa pecahan tidak bias ke bawah
 * dan terakumulasi (truncation drift) di ribuan pembelian.
 */
export function computeNewWac(
  stockMilli: number,
  wacMinor: number,
  qtyMilli: number,
  unitCostMinor: number,
): number {
  const newStock = BigInt(stockMilli) + BigInt(qtyMilli);
  if (newStock <= 0n) return 0;
  return Number(
    (BigInt(stockMilli) * BigInt(wacMinor) + BigInt(qtyMilli) * BigInt(unitCostMinor) + newStock / 2n) / newStock,
  );
}

/**
 * Nilai persediaan (IDR) dari stok (milli) × WAC (minor), half-up.
 */
export function stockValueFromMilliWac(stockMilli: number, wacMinor: number): number {
  return Number((BigInt(stockMilli) * BigInt(wacMinor) + 5_000_000n) / 10_000_000n);
}

/**
 * Total biaya IDR dari jumlah (milli) × harga satuan IDR, dibulatkan.
 */
export function costTotalFromMilli(qtyMilli: number, unitCostIdr: number): number {
  return Math.round((qtyMilli * unitCostIdr) / 1000);
}

// ── Stock Movement Helpers ──────────────────────────────────────

/**
 * Hitung stock_after_milli setelah suatu pergerakan.
 */
export function computeStockAfter(
  currentStockMilli: number,
  movementType: "in" | "out" | "loss",
  quantityMilli: number,
): number {
  switch (movementType) {
    case "in":
      return currentStockMilli + quantityMilli;
    case "out":
    case "loss":
      return Math.max(0, currentStockMilli - quantityMilli);
  }
}

/**
 * Hitung total_value_minor untuk stock movement.
 */
export function computeMovementValue(
  quantityMilli: number,
  unitCostMinor: number,
): number {
  return Math.round((quantityMilli * unitCostMinor) / 1000);
}
