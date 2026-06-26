/**
 * E2E environment configuration.
 *
 * Reads from process.env (CI / shell) or falls back to local Supabase defaults.
 * NEVER hardcode real credentials here.
 */

export const E2E = {
  /** Base URL for the web app under test */
  baseUrl: process.env.E2E_BASE_URL || "http://localhost:4173",

  /** Supabase API URL (local or remote) */
  supabaseUrl:
    process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "http://localhost:54321",

  /** Supabase anon key (public, safe for browser) */
  supabaseAnonKey:
    process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",

  /** Supabase service-role key (ONLY for test setup/cleanup — never in browser code) */
  serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "",

  /** Inbucket email catcher URL (local only) */
  inbucketUrl: process.env.E2E_INBUCKET_URL || "http://localhost:54324",

  /** Run ID for isolating test data. Generated once per suite run. */
  runId: process.env.E2E_RUN_ID || `e2e-${Date.now()}`,

  /** Whether running against local stack (true) or deployed (false) */
  get isLocal() {
    return this.baseUrl.includes("localhost");
  },

  /** Whether service-role key is available (local mode) */
  get hasServiceRole() {
    return Boolean(this.serviceRoleKey);
  },
} as const;

/** E2E-prefixed helpers for test data isolation */
export const E2E_PREFIX = "[E2E]" as const;

export function e2eName(base: string): string {
  return `${E2E_PREFIX} ${base}`;
}

export function e2eEmail(local: string): string {
  return `${local}@ledjer.test`;
}

export function e2eDescription(base: string): string {
  return `${E2E_PREFIX} ${base}`;
}
