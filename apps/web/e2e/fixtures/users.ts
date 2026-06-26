/**
 * Pre-defined E2E test users.
 *
 * These are seeded via Supabase Admin API or SQL before E2E runs.
 * Passwords are intentionally weak (test-only) and never used in production.
 */

export interface TestUser {
  email: string;
  password: string;
  fullName: string;
  role: "owner" | "staff";
}

export const E2E_OWNER: TestUser = {
  email: "e2e-owner@ledjer.test",
  password: "Password123!",
  fullName: "E2E Owner",
  role: "owner",
};

export const E2E_STAFF: TestUser = {
  email: "e2e-staff@ledjer.test",
  password: "Password123!",
  fullName: "E2E Staff",
  role: "staff",
};

export const E2E_OWNER2: TestUser = {
  email: "e2e-owner2@ledjer.test",
  password: "Password123!",
  fullName: "E2E Owner 2",
  role: "owner",
};

/** All users that need seeding */
export const ALL_TEST_USERS = [E2E_OWNER, E2E_STAFF, E2E_OWNER2] as const;

/** Unique email for registration tests (avoids collision) */
export function freshRegisterEmail(): string {
  return `e2e-register-${Date.now()}@ledjer.test`;
}
