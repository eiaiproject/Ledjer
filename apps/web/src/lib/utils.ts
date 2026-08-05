import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Terpusat URL dukungan sukarela.
 * Bersifat publik — bukan secret.
 */
export const SUPPORT_URL = "https://trakteer.id/eiaiproject/tip" as const;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format number as Indonesian Rupiah.
 *  Returns "—" (em dash) for null/undefined to signal missing data.
 *  Returns "Rp 0" for zero amounts. */
export function formatIDR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Like formatIDR but shows "Rp 0" instead of "—" when value is null/undefined. */
export function formatIDROrZero(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "Rp 0";
  return formatIDR(amount);
}

/** Format number with Indonesian thousand separators */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function parseDateValue(date: string | Date): Date {
  if (date instanceof Date) return date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(date);
}

export function formatDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA");
}

type DateInput = string | Date | null | undefined;

/** Format date as DD/MM/YYYY (Indonesian) */
export function formatDate(date: DateInput): string {
  if (!date) return "-";
  const d = parseDateValue(date);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}



/** Format long Indonesian date (e.g., "12 Juli 2026") */
export function formatDateLong(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = parseDateValue(date);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Format short date (e.g., "15 Jun 2026") */
export function formatShortDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = parseDateValue(date);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}



/** Format date range in Indonesian (e.g., "1–12 Juli 2026", "25 Juni–12 Juli 2026") */
export function formatDateRange(fromDate: string, toDate: string): string {
  const from = parseDateValue(fromDate);
  const to = parseDateValue(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "-";

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();

  const dayMonthYear = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(to);

  if (sameMonth) {
    // 1–12 Juli 2026
    return `${from.getDate()}–${dayMonthYear}`;
  }
  if (sameYear) {
    // 25 Juni–12 Juli 2026
    const fromMonth = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long" }).format(from);
    return `${fromMonth}–${dayMonthYear}`;
  }
  // 20 Desember 2025–12 Januari 2026
  const fromFull = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(from);
  return `${fromFull}–${dayMonthYear}`;
}

export function createClientToken(): string {
  return crypto.randomUUID();
}

export function parseAmountInput(
  value: unknown,
  emptyValue: number | undefined = undefined
) {
  const rawValue = value == null ? "" : String(value as string);
  const digits = rawValue.replace(/\D/g, "");
  if (!digits) return emptyValue;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : emptyValue;
}

/**
 * Parse a signed decimal input (e.g. "-12,5", "-12.5", "1.234,56") into a
 * number. Accepts an optional leading "-", Indonesian or international
 * separators, and caps precision to 3 decimals (matches milli stock units).
 * Blank or a lone "-" returns emptyValue — so typing a minus sign first
 * keeps working instead of being swallowed by Number("").
 */
export function parseSignedDecimalInput(
  value: unknown,
  emptyValue: number | undefined = undefined
): number | undefined {
  // Accept strings (form values) and numbers; anything else (e.g. objects)
  // is rejected instead of being stringified as "[object Object]".
  let raw = "";
  if (typeof value === "string") raw = value;
  else if (typeof value === "number") raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "-." || trimmed === "-,") return emptyValue;
  const negative = trimmed.startsWith("-");
  let normalized = trimmed.replace(/[^\d.,]/g, "");
  const dotCount = (normalized.match(/\./g) ?? []).length;
  if (normalized.includes(".") && normalized.includes(",")) {
    // Indonesian convention: "." thousands, "," decimal — "1.234,5"
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else if (dotCount > 1) {
    // Several dots with no comma — treat them as thousands separators
    normalized = normalized.replaceAll(".", "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  if (!normalized) return emptyValue;
  // Note: a single dot without commas is read as the decimal separator
  // ("1.5" = 1.5); multiple dots are Indonesian thousands ("1.234.567").
  const amount = Number(`${negative ? "-" : ""}${normalized}`);
  if (!Number.isFinite(amount)) return emptyValue;
  const rounded = Math.round(amount * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

/** Format bytes to human-readable string. */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatAmountInput(value: unknown, blankWhenZero = false) {
  if (value === undefined || value === null || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  if (blankWhenZero && amount === 0) return "";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(amount);
}

