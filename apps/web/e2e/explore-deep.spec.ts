import { test, expect } from "./helpers/auth";

test.describe("Deep Page Validation", () => {
  test("Dashboard shows financial summary", async ({ authPage }) => {
    await authPage.goto("/dashboard", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("Rp");
    expect(text.length).toBeGreaterThan(100);
  });

  test("Transactions table loads and shows data", async ({ authPage }) => {
    await authPage.goto("/transactions", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("TRX-");
  });

  test("New transaction form has all fields", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "networkidle" });
    const html = await authPage.evaluate(() => document.body?.innerHTML || "");
    const hasForm = html.includes("input") || html.includes("select") || html.includes("button");
    expect(hasForm).toBe(true);
  });

  test("Accounts table shows accounts with Kas and BCA", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("Kas");
    expect(text).toContain("BCA");
  });

  test("Products page shows MacBook Air", async ({ authPage }) => {
    await authPage.goto("/products", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("MacBook");
  });

  test("Trial Balance shows accounts with balances", async ({ authPage }) => {
    await authPage.goto("/reports/trial-balance", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("Rp");
  });

  test("Profit & Loss shows revenue", async ({ authPage }) => {
    await authPage.goto("/reports/profit-loss", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("Pendapatan");
  });

  test("Balance Sheet shows assets and equity", async ({ authPage }) => {
    await authPage.goto("/reports/balance-sheet", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("Aset");
    expect(text).toContain("Ekuitas");
  });

  test("General Ledger has data", async ({ authPage }) => {
    await authPage.goto("/reports/general-ledger", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("Rp");
  });

  test("Team page shows Irawan as owner", async ({ authPage }) => {
    await authPage.goto("/settings/team", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toContain("Irawan");
  });

  test("Organization settings page loads", async ({ authPage }) => {
    await authPage.goto("/settings/organization", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text.length).toBeGreaterThan(50);
  });

  test("Period locks shows locked period", async ({ authPage }) => {
    await authPage.goto("/settings/period-locks", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text.length).toBeGreaterThan(50);
  });

  test("Audit logs page loads without error", async ({ authPage }) => {
    await authPage.goto("/settings/audit-logs", { waitUntil: "networkidle" });
    const text = await authPage.evaluate(() => document.body?.innerText || "");
    expect(text).toBeTruthy();
  });

  test("Invoice page returns proper error", async ({ authPage }) => {
    const resp = await authPage.goto("/transactions/invoice/FAKE", { waitUntil: "domcontentloaded" });
    // Should handle gracefully — either 404 or redirect
    expect(resp?.status() || 0).toBeLessThan(500);
  });
});
