/**
 * Tanggal dinamis zona Asia/Jakarta untuk E2E.
 *
 * Server menegakkan append-only kronologis (tanggal tulis tak boleh lebih tua
 * dari catatan posted terakhir) dan menolak masa depan — jadi spec menulis
 * selalu memakai HARI INI, bukan tanggal tetap yang membusuk.
 */

/** Hari ini YYYY-MM-DD zona Asia/Jakarta (sama dengan guard server). */
export function todayJakarta(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);
}

/** Hari ini format panjang id-ID ("17 September 2026") utk header detail. */
export function todayLongId(d = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
