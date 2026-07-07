import { E2E } from "./fixtures/env";
import { fullSeed } from "./fixtures/seed";
import { fullCleanup } from "./fixtures/cleanup";

/**
 * Playwright global setup.
 *
 * - deploy-smoke: no seed, no local Supabase, just return.
 * - full-local: cleanup → seed → ready for authenticated E2E.
 */
async function globalSetup() {
  if (E2E.isDeploySmoke) {
    console.log(`[global-setup] mode=${E2E.mode} — skipping seed.`);
    return;
  }

  if (E2E.mode === "local-smoke") {
    console.log(`[global-setup] mode=${E2E.mode} — skipping seed.`);
    return;
  }

  // full-local mode: require Supabase access
  if (!E2E.supabaseUrl) {
    throw new Error(
      "[global-setup] E2E_SUPABASE_URL required for full-local mode. " +
        "Set E2E_MODE=deploy-smoke or provide E2E_SUPABASE_URL.",
    );
  }
  if (!E2E.hasServiceRole) {
    throw new Error(
      "[global-setup] E2E_SUPABASE_SERVICE_ROLE_KEY required for full-local mode.",
    );
  }

  console.log(`[global-setup] mode=${E2E.mode} — cleaning up previous E2E data...`);
  await fullCleanup();

  console.log(`[global-setup] seeding users, org, staff...`);
  const orgId = await fullSeed();
  console.log(`[global-setup] seed complete. orgId=${orgId}`);
}

export default globalSetup;
