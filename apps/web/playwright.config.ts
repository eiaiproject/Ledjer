import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for Ledjer.
 *
 * Modes (controlled via E2E_MODE env):
 *   deploy-smoke — production public-only smoke
 *   local-smoke  — local public smoke without seed
 *   local-full   — local full public E2E without seed
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.E2E_VISUAL ? [] : ["**/visual.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  maxFailures: process.env.CI ? 10 : undefined,
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
  webServer: (() => {
    // If E2E_BASE_URL is a non-localhost URL (deploy smoke), skip server startup entirely
    if (process.env.E2E_BASE_URL && !process.env.E2E_BASE_URL.includes('localhost')) {
      return undefined;
    }

    // When SKIP_BUILD_FOR_CI is set, build was already done upstream (CI artifact)
    const skipBuild = process.env.SKIP_BUILD_FOR_CI === '1';

    // Build the webServer config(s) as an array (Playwright supports both single and array)
    const servers: Array<{
      command: string;
      port: number;
      reuseExistingServer?: boolean;
    }> = [
      // Primary: Vite preview server for the frontend app
      {
        command: skipBuild
          ? "LEDJER_CSP_LOCAL=1 pnpm preview"
          : "LEDJER_CSP_LOCAL=1 pnpm build && pnpm preview",
        port: 4173,
        reuseExistingServer: !process.env.CI && !process.env.E2E_BASE_URL,
      },
    ];

    return servers;
  })(),
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
});
