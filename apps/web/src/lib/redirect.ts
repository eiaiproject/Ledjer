export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!value) return fallback;

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;
    return decoded;
  } catch {
    return fallback;
  }
}

export function buildRedirectSearch(path: string): string {
  return `redirect=${encodeURIComponent(getSafeRedirectPath(path))}`;
}
