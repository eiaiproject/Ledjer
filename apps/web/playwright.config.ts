import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for Ledjer.
 *
 * Modes (controlled via E2E_MODE env):
 *   deploy-smoke — production public-only smoke
 *   full-local   — full E2E with local Supabase + seeded data
 *   local-smoke  — local smoke without seed
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Deploy smoke: no retries needed (deterministic). Full local: retry once in CI.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  // Only run globalSetup for full-local mode (needs Supabase seed)
  globalSetup:
    process.env.E2E_MODE === "full-local"
      ? "./e2e/global-setup.ts"
      : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Cross-browser only when explicitly enabled (not in deploy smoke)
    ...(process.env.E2E_CROSS_BROWSER
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
        ]
      : []),
    // Mobile viewports (opt-in)
    ...(process.env.E2E_FULL
      ? [
          {
            name: "mobile-chrome",
            use: { ...devices["Pixel 5"] },
          },
          {
            name: "mobile-safari",
            use: { ...devices["iPhone 13"] },
          },
        ]
      : []),
  ],
  // Only start local webServer when not targeting a remote URL
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm preview",
        port: 4173,
        reuseExistingServer: !process.env.CI,
      },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
});
