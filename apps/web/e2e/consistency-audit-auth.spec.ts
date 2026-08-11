/**
 * Full UI/UX Consistency Audit — AUTHENTICATED PAGES.
 *
 * Requires the Worker backend reachable at E2E_BASE_URL and credentials
 * E2E_EMAIL / E2E_PASSWORD (defaults: ledjer@yopmail.com / Ledjer26#).
 *
 * Runs 18 protected pages through the same metrics gatherer used for
 * public pages; results are merged into .audit-results.json by an
 * afterAll hook at the suite level.
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:5173 \
 *   npx playwright test e2e/consistency-audit-auth.spec.ts --project=chromium --reporter=list --workers=1
 */

import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test as authTest } from "./helpers/auth";
import { gatherMetrics as gather, type PageMetrics } from "./helpers/consistency-metrics";

const PAGES = [
  "/dashboard",
  "/transactions",
  "/accounts",
  "/products",
  "/invoices",
  "/journals",
  "/reports/general-ledger",
  "/reports/trial-balance",
  "/reports/profit-loss",
  "/reports/balance-sheet",
  "/reports/cash-flow",
  "/reports/aging",
  "/notifications",
  "/settings/team",
  "/settings/period-locks",
  "/import",
  "/reconciliation",
  "/opening-balance",
];

const OUT_DIR = join(process.cwd(), "e2e");
const OUT_JSON = join(OUT_DIR, ".audit-results-auth.json");

// Share the public-suite results file path so the two files can be diffed.
const PUBLIC_JSON = join(OUT_DIR, ".audit-results.json");
const allResults: PageMetrics[] = [];

authTest.describe("Consistency Audit (authenticated pages)", () => {
  for (const path of PAGES) {
    authTest(`audit ${path}`, async ({ authPage }) => {
      const metrics = await gather(authPage, path);
      allResults.push(metrics);

      expect(metrics.status, `HTTP status for ${path}`).toBeGreaterThanOrEqual(200);
      expect(metrics.status, `HTTP status for ${path}`).toBeLessThan(400);
      expect(metrics.structure.h1Count, `${path} h1 count`).toBeGreaterThanOrEqual(1);
      expect(metrics.forms.inputsWithoutLabel, `${path} unlabeled inputs`).toBe(0);

      console.log(
        `  [${metrics.status}] ${path.padEnd(28)} ` +
          `h1=${metrics.structure.h1Count} ` +
          `ct=${metrics.contrast.body?.ratio ?? "n/a"} ` +
          `tt<44=${metrics.touchTargets.below44}/${metrics.touchTargets.total} ` +
          `inputs=${metrics.forms.inputsTotal}`,
      );
    });
  }

  authTest.afterAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_JSON, JSON.stringify(allResults, null, 2), "utf8");
    console.log(`\n  wrote ${OUT_JSON} (${allResults.length} authed pages)\n`);
    console.log(`  compare with public results: ${PUBLIC_JSON}`);
  });
});