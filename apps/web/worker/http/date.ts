import { badRequest } from "./errors";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDate(input: string, code: string): string {
  const value = input.trim();
  if (!DATE_RE.test(value)) {
    throw badRequest(code, "Date must use YYYY-MM-DD format");
  }
  return value;
}
