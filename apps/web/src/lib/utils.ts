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

/** Format date as DD/MM/YYYY (Indonesian) */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = parseDateValue(date);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
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



export function createClientToken(): string {
  return crypto.randomUUID();
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

