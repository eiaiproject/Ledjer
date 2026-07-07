/**
 * E2E Test Users for Cloudflare D1 Worker API.
 * No Supabase dependency — all seeding goes through Worker API endpoints.
 */

export interface TestUser {
  email: string;
  password: string;
  fullName: string;
}

export const E2E_OWNER: TestUser = {
  email: `owner-${Date.now()}@e2e-test.local`,
  password: "E2eTestPass1!",
  fullName: "E2E Owner",
};

export const E2E_STAFF: TestUser = {
  email: `staff-${Date.now()}@e2e-test.local`,
  password: "E2eTestPass1!",
  fullName: "E2E Staff",
};

export const E2E_VIEWER: TestUser = {
  email: `viewer-${Date.now()}@e2e-test.local`,
  password: "E2eTestPass1!",
  fullName: "E2E Viewer",
};

export const ALL_TEST_USERS = [E2E_OWNER, E2E_STAFF, E2E_VIEWER];

/** Generate a unique test user for isolated test runs. */
export function uniqueUser(prefix: string): TestUser {
  return {
    email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e-test.local`,
    password: "E2eTestPass1!",
    fullName: `E2E ${prefix}`,
  };
}
