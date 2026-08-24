/**
 * Full UI/UX Consistency, Proportion, Symmetry Audit - PUBLIC PAGES.
 *
 * Not pixel diff (visual.spec.ts owns that). This measures STRUCTURE:
 *  - Design token usage (spacing/radius/typography) across pages
 *  - Heading hierarchy (h1, h2, h3 depth consistency)
 *  - Touch target sizes (44x44 minimum)
 *  - Color contrast (WCAG 2.1 AA)
 *  - Page chrome symmetry (header/footer presence + width)
 *  - Form symmetry (label-input proximity, error announcement)
 *  - Whitespace budget variance
 *
 * Output: e2e/.audit-results.json (public pages only).
 * For authenticated pages, see consistency-audit-auth.spec.ts.
 *
 * Run:
 *   E2E_BASE_URL=https://ledjer.id npx playwright test e2e/consistency-audit.spec.ts --project=chromium --reporter=list
 */

import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gatherMetrics as gather, type PageMetrics } from "./helpers/consistency-metrics";

const PAGES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/contact",
  "/security",
  "/refund",
];

const OUT_DIR = join(process.cwd(), "e2e");
const OUT_JSON = join(OUT_DIR, ".audit-results.json");

const allResults: PageMetrics[] = [];

test.describe("Full UI/UX Consistency, Proportion, Symmetry Audit (public)", () => {
  for (const path of PAGES) {
    test(`audit ${path}`, async ({ page }) => {
      const metrics = await gather(page, path);
      allResults.push(metrics);

      expect(metrics.status, `HTTP status for ${path}`).toBeGreaterThanOrEqual(200);
      expect(metrics.status, `HTTP status for ${path}`).toBeLessThan(400);
      expect(metrics.structure.h1Count, `${path} h1 count`).toBeGreaterThanOrEqual(1);
      expect(metrics.forms.inputsWithoutLabel, `${path} unlabeled inputs`).toBe(0);

      const hasMain =
        metrics.structure.landmarks.main >= 1 ||
        (await page.locator('[role="main"]').count()) >= 1;
      if (!hasMain) {
        console.log(`  WARN: ${path} missing <main> landmark`);
      }

      console.log(
        `  [${metrics.status}] ${path.padEnd(18)} ` +
          `h1=${metrics.structure.h1Count} ` +
          `ct=${metrics.contrast.body?.ratio ?? "n/a"} ` +
          `tt<44=${metrics.touchTargets.below44}/${metrics.touchTargets.total} ` +
          `inputs=${metrics.forms.inputsTotal} ` +
          `h=${metrics.chrome.hasHeader ? "Y" : "N"}` +
          `f=${metrics.chrome.hasFooter ? "Y" : "N"}`,
      );
    });
  }

  test.afterAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_JSON, JSON.stringify(allResults, null, 2), "utf8");
    console.log(`\n  wrote ${OUT_JSON} (${allResults.length} public pages)\n`);
  });
});