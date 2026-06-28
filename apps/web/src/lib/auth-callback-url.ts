/**
 * Build a safe auth callback URL with optional redirect path.
 *
 * Uses `window.location.origin` as base and only appends redirect
 * if it differs from the default destination, preventing open redirects.
 */
export function buildAuthCallbackUrl(
  redirectPath?: string,
  defaultRedirect = "/dashboard",
): URL {
  const url = new URL("/auth/callback", window.location.origin);
  if (redirectPath && redirectPath !== defaultRedirect) {
    url.searchParams.set("redirect", redirectPath);
  }
  return url;
}
