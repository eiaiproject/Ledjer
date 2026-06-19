import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format number as Indonesian Rupiah */
export function formatIDR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format number with Indonesian thousand separators */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format date as DD/MM/YYYY (Indonesian) */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Format date with month name (e.g., "15 Juni 2026") */
export function formatDateLong(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
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
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Format relative time (e.g., "2 jam lalu") */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const rtf = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
  const minutes = Math.round(diff / 60000);
  const hours = Math.round(diff / 3600000);
  const days = Math.round(diff / 86400000);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  if (Math.abs(days) < 30) return rtf.format(-days, "day");
  return formatDate(d);
}

export function parseAmountInput(
  value: unknown,
  emptyValue: number | undefined = undefined
) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return emptyValue;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : emptyValue;
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

export function parseDecimalInput(
  value: unknown,
  emptyValue: number | undefined = undefined
) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return emptyValue;
  const normalized = rawValue.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const [wholePart, ...fractionParts] = normalized.split(".");
  const numericText = `${wholePart || "0"}${fractionParts.length ? `.${fractionParts.join("")}` : ""}`;
  const amount = Number(numericText);
  return Number.isFinite(amount) ? amount : emptyValue;
}
