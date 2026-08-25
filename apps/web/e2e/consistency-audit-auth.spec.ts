/**
 * Full UI/UX Consistency, Proportion, Symmetry Audit - AUTHENTICATED PAGES.
 *
 * Complements consistency-audit.spec.ts (public pages). Measures the same
 * STRUCTURE metrics on the dashboard-area pages using the authenticated
 * `test` fixture from ./helpers/auth (canonical name so Sonar recognizes the
 * file as a test file):
 *  - Design token usage (spacing/radius/typography) across pages
 *  - Heading hierarchy (h1, h2, h3 depth consistency)
 *  - Touch target sizes (44x44 minimum)
 *  - Color contrast (WCAG 2.1 AA)
 *  - Page chrome symmetry (header/footer presence + width)
 *  - Form symmetry (label-input proximity)
 *  - Whitespace budget variance
 *
 * Output: e2e/.audit-results-auth.json
 *
 * Run (desktop):
 *   E2E_BASE_URL=https://ledjer-staging.eiai.workers.dev \
 *   E2E_EMAIL=staging@yopmail.com E2E_PASSWORD=Staging1234 \
 *   npx playwright test e2e/consistency-audit-auth.spec.ts --project=chromium --workers=1
 *
 * Run (mobile viewports, Android + iOS):
 *   E2E_FULL=1 ... --project=mobile-chrome --project=mobile-safari --workers=1
 */

import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "./helpers/auth";
import { gatherMetrics as gather, type PageMetrics } from "./helpers/consistency-metrics";

const PAGES = [
  "/dashboard",
  "/transactions",
  "/transactions/new",
  "/accounts",
  "/products",
  "/invoices",
  "/invoices/new",
  "/notifications",
  "/reports/general-ledger",
  "/reports/trial-balance",
  "/reports/profit-loss",
  "/reports/balance-sheet",
  "/reports/cash-flow",
  "/reports/aging",
  "/reconciliation",
  "/opening-balance",
  "/import",
  "/journals",
  "/settings/team",
  "/settings/period-locks",
  "/settings/organization",
  "/settings/security",
];

const OUT_DIR = join(process.cwd(), "e2e");
const OUT_JSON = join(OUT_DIR, ".audit-results-auth.json");

const allResults: PageMetrics[] = [];

test.describe("Full UI/UX Consistency, Proportion, Symmetry Audit (authenticated)", () => {
  for (const path of PAGES) {
    test(`audit ${path}`, async ({ authPage }) => {
      const metrics = await gather(authPage, path);
      allResults.push(metrics);

      expect(metrics.status, `HTTP status for ${path}`).toBeGreaterThanOrEqual(200);
      expect(metrics.status, `HTTP status for ${path}`).toBeLessThan(400);
      expect(metrics.structure.h1Count, `${path} h1 count`).toBeGreaterThanOrEqual(1);
      expect(metrics.forms.inputsWithoutLabel, `${path} unlabeled inputs`).toBe(0);

      console.log(
        `  [${metrics.status}] ${path.padEnd(24)} ` +
          `h1=${metrics.structure.h1Count} ` +
          `ct=${metrics.contrast.body?.ratio ?? "n/a"} ` +
          `tt<44=${metrics.touchTargets.below44}/${metrics.touchTargets.total} ` +
          `inputs=${metrics.forms.inputsTotal} ` +
          `w=${Math.round(metrics.whitespace.viewportWidth)}px ` +
          `h=${metrics.chrome.hasHeader ? "Y" : "N"}` +
          `f=${metrics.chrome.hasFooter ? "Y" : "N"}`,
      );
    });
  }

  test.afterAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_JSON, JSON.stringify(allResults, null, 2), "utf8");
    console.log(`\n  wrote ${OUT_JSON} (${allResults.length} authed pages)\n`);
  });
});
