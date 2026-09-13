/** Shared query-param parsing — cap limit, clamp offset, batasi search (#8, #14). */
export const MAX_LIST_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;

export function parseListLimit(value: string | null, max = MAX_LIST_LIMIT): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return Math.min(n, max);
}

export function parseListOffset(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return Math.min(n, 1_000_000);
}

export function parseSearch(value: string | null, max = MAX_SEARCH_LENGTH): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}
