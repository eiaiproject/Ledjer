/**
 * E2E environment configuration.
 *
 * Modes:
 *   deploy-smoke — production public-only smoke (no local Supabase)
 *   full-local   — full E2E with local Supabase + seeded data
 *   local-smoke  — local smoke without seed
 *
 * NEVER hardcode real credentials here.
 */

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:4173";

function detectMode(): "deploy-smoke" | "full-local" | "local-smoke" {
  const explicit = process.env.E2E_MODE;
  if (explicit === "deploy-smoke" || explicit === "full-local" || explicit === "local-smoke") {
    return explicit;
  }
  // Auto-detect
  if (baseUrl.includes("ledjer-ahk.pages.dev") || baseUrl.includes("pages.dev")) {
    return "deploy-smoke";
  }
  if (baseUrl.includes("localhost") && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
    return "full-local";
  }
  if (baseUrl.includes("localhost")) {
    return "local-smoke";
  }
  // Unknown remote URL — treat as deploy smoke (safe default)
  return "deploy-smoke";
}

const mode = detectMode();

export const E2E = {
  baseUrl,

  mode,

  get isDeploySmoke() {
    return mode === "deploy-smoke";
  },
  get isFullLocal() {
    return mode === "full-local";
  },
  get isLocal() {
    return baseUrl.includes("localhost");
  },

  supabaseUrl:
    process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",

  supabaseAnonKey:
    process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",

  /** ONLY for test setup/cleanup — never in browser code */
  serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "",

  inbucketUrl: process.env.E2E_INBUCKET_URL || "http://localhost:54324",

  runId: process.env.E2E_RUN_ID || `e2e-${Date.now()}`,

  get hasServiceRole() {
    return Boolean(this.serviceRoleKey);
  },

  ownerEmail: "e2e-owner@ledjer.test",
  ownerPassword: "Password123!",
  staffEmail: "e2e-staff@ledjer.test",
  staffPassword: "Password123!",
} as const;

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
