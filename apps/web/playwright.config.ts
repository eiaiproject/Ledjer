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
  testIgnore:
    process.env.E2E_MODE === "full-local" && !process.env.E2E_VISUAL
      ? ["**/visual.spec.ts"]
      : [],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Deploy smoke: no retries needed (deterministic). Full local: retry once in CI.
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
  webServer: (() => {
    // If E2E_BASE_URL is a non-localhost URL (deploy smoke), skip server startup entirely
    if (process.env.E2E_BASE_URL && !process.env.E2E_BASE_URL.includes('localhost')) {
      return undefined;
    }

    // Build the webServer config(s) as an array (Playwright supports both single and array)
    const servers: Array<{
      command: string;
      port: number;
      reuseExistingServer?: boolean;
    }> = [
      // Primary: Vite preview server for the frontend app
      {
        command:
          "LEDJER_CSP_LOCAL=1 " +
          "VITE_SUPABASE_URL=${E2E_SUPABASE_URL:-$VITE_SUPABASE_URL} " +
          "VITE_SUPABASE_ANON_KEY=${E2E_SUPABASE_ANON_KEY:-$VITE_SUPABASE_ANON_KEY} " +
          "pnpm build && pnpm preview",
        port: 4173,
        reuseExistingServer: !process.env.CI && !process.env.E2E_BASE_URL,
      },
    ];

    // Additional: fake Mayar server for billing E2E tests
    // Activated by setting E2E_BILLING=1
    if (process.env.E2E_BILLING === "1") {
      servers.push({
        command:
          `FAKE_MAYAR_PORT=4567 FAKE_MAYAR_STATUS=paid ` +
          `node ../../scripts/fake-mayar-server.mjs`,
        port: 4567,
        reuseExistingServer: false,
      });
    }

    return servers;
  })(),
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
});
