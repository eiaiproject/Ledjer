/**
 * E2E test environment configuration for Cloudflare Worker API.
 * No Supabase dependency — all interaction goes through Worker API endpoints.
 */

export const E2E = {
  baseUrl: process.env.E2E_BASE_URL || "http://localhost:4173",
  /** When set, enables full-local mode with seeded users via Worker API */
  mode: process.env.E2E_MODE || "local-smoke",
};

export function isFullLocal(): boolean {
  return E2E.mode === "full-local";
}

export function isDeploySmoke(): boolean {
  return E2E.mode === "deploy-smoke";
}

/** Generate a prefixed name for E2E test data to avoid collisions. */
export function e2eName(base: string): string {
  return `[E2E] ${base} ${Date.now()}`;
}
