import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for Ledjer.
 *
 * Modes:
 *   - Default: runs against pnpm preview (port 4173)
 *   - With E2E_BASE_URL: runs against specified URL (deployed or custom)
 *   - With E2E_SUPABASE_URL + service role: enables full local test mode
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Enable additional browsers in CI or when --project is specified
    ...(process.env.CI
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
    // Mobile viewports
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
