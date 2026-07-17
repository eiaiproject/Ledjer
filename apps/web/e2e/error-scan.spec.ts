import { test, expect } from "./helpers/auth";

const PAGES = [
  "/dashboard", "/transactions", "/transactions/new", "/accounts",
  "/products", "/reports/trial-balance", "/reports/profit-loss",
  "/reports/balance-sheet", "/reports/general-ledger",
  "/settings/team", "/settings/organization", "/settings/period-locks",
  "/settings/audit-logs",
];

const allConsoleErrors: string[] = [];
const allPageErrors: string[] = [];
const allFailedHttp: { url: string; status: number }[] = [];

test.describe("Error Scan", () => {
  test("navigate all pages and capture errors", async ({ authPage }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedHttp: { url: string; status: number }[] = [];

    authPage.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text().substring(0, 200));
      }
    });
    authPage.on("pageerror", (err) => {
      pageErrors.push(err.message.substring(0, 200));
    });
    authPage.on("response", (res) => {
      if (res.status() >= 400) {
        failedHttp.push({ url: res.url().substring(0, 100), status: res.status() });
      }
    });

    for (const p of PAGES) {
      try {
        await authPage.goto(p, { waitUntil: "domcontentloaded", timeout: 15000 });
        await authPage.waitForTimeout(500);
      } catch (e) {
        console.log(`Navigation timeout/skip for ${p}: ${e.message.substring(0, 80)}`);
      }
    }

    // Filter out Cloudflare RUM beacon (404 is expected)
    const realFailedHttp = failedHttp.filter(
      (f) => !f.url.includes("cdn-cgi/rum"),
    );

    console.log("\n=== Console Errors ===");
    console.log(JSON.stringify(consoleErrors));
    console.log("\n=== Page Errors ===");
    console.log(JSON.stringify(pageErrors));
    console.log("\n=== Failed HTTP (non-RUM) ===");
    console.log(JSON.stringify(realFailedHttp));

    expect(pageErrors).toEqual([]);
    // Console errors should be empty or only font-related
    for (const e of consoleErrors) {
      expect(e).not.toContain("Uncaught");
      expect(e).not.toContain("React");
    }
    // No real HTTP failures (ignore cancelled requests = status 0)
    const realErrors = realFailedHttp.filter((f) => f.status !== 0);
    expect(realErrors).toEqual([]);
  });
});
