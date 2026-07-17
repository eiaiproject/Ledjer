import { test, expect } from "./helpers/auth";

const PAGES = [
  { path: "/", name: "Landing" },
  { path: "/auth/login", name: "Login" },
  { path: "/auth/register", name: "Register" },
  { path: "/auth/forgot-password", name: "Forgot Password" },
  { path: "/dashboard", name: "Dashboard" },
  { path: "/transactions", name: "Transactions" },
  { path: "/transactions/new", name: "New Transaction" },
  { path: "/accounts", name: "Accounts" },
  { path: "/products", name: "Products" },
  { path: "/reports/profit-loss", name: "Profit & Loss" },
  { path: "/reports/balance-sheet", name: "Balance Sheet" },
  { path: "/reports/trial-balance", name: "Trial Balance" },
  { path: "/reports/general-ledger", name: "General Ledger" },
  { path: "/settings/team", name: "Team Settings" },
  { path: "/settings/organization", name: "Org Settings" },
  { path: "/settings/period-locks", name: "Period Locks" },
  { path: "/settings/audit-logs", name: "Audit Logs" },
];

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: { url: string; status: number }[] = [];

test.describe("Full App Exploration", () => {
  test.beforeEach(async ({ authPage }) => {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    failedRequests.length = 0;

    authPage.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(`${msg.text()} (${msg.location().url})`);
      }
    });
    authPage.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    authPage.on("requestfailed", (req) => {
      failedRequests.push({ url: req.url(), status: req.failure()?.errorText ? 0 : 0 });
    });
    authPage.on("response", (res) => {
      if (res.status() >= 400) {
        failedRequests.push({ url: res.url(), status: res.status() });
      }
    });
  });

  for (const page of PAGES) {
    test(`${page.name} (${page.path})`, async ({ authPage }) => {
      const response = await authPage.goto(page.path, {
        waitUntil: "networkidle",
        timeout: 15000,
      });

      // Check HTTP status
      const status = response?.status() || 0;
      expect(status).toBeLessThan(400);

      // Check page title exists
      const title = await authPage.title();
      expect(title).toBeTruthy();

      // Check for key interactive elements
      const bodyText = await authPage.evaluate(() => document.body?.innerText?.substring(0, 100) || "");
      expect(bodyText).toBeTruthy();

      // Collect errors
      const errors = {
        consoleErrors: [...consoleErrors],
        pageErrors: [...pageErrors],
        failedRequests: [...failedRequests],
      };

      if (errors.consoleErrors.length > 0 || errors.pageErrors.length > 0) {
        console.log(`\n[WARN] ${page.name} errors:`, JSON.stringify(errors, null, 2));
      }

      // No uncaught page errors
      expect(errors.pageErrors).toEqual([]);
    });
  }
});
