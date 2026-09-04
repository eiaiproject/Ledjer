import { badRequest } from "./errors";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDate(input: string, code: string): string {
  const value = input.trim();
  if (!DATE_RE.test(value)) {
    throw badRequest(code, "Date must use YYYY-MM-DD format");
  }
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12) {
    throw badRequest(code, "Date must be a valid calendar date");
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw badRequest(code, "Date must be a valid calendar date");
  }
  return value;
}
