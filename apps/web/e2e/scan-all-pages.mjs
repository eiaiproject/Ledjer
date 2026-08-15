/**
 * E2E Comprehensive Page Scan v2 — Ledjer
 *
 * Visits EVERY page (public + protected + detail), interacts with ALL
 * interactive elements visible on the page, and reports everything:
 * console errors, page errors, 4xx/5xx responses, broken interactions.
 *
 * Login is done via the API (like the existing auth fixture) for reliability.
 * Viewport is mobile-first (375x812) to expose mobile nav elements.
 * Dynamic routes are tested by first fetching real data IDs from APIs.
 *
 * Usage:
 *   node apps/web/e2e-scan-all-pages.mjs
 *
 * Environment variables:
 *   E2E_EMAIL     — login email (default: ledjer@yopmail.com)
 *   E2E_PASSWORD  — login password (default: Ledjer26#)
 *   BASE_URL      — target URL   (default: https://ledjer.id)
 */

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────
const BASE_URL    = process.env.BASE_URL    || "https://ledjer.id";
const EMAIL       = process.env.E2E_EMAIL   || "ledjer@yopmail.com";
const PASSWORD    = process.env.E2E_PASSWORD || "Ledjer26#";
const NAV_TIMEOUT = 25000;
const PAGE_WAIT   = 1000;

// ── Results accumulator ────────────────────────────────────────────
const results = {
  passed: [],
  failed: [],
  warnings: [],
  skipped: [],
  interactions: { total: 0, clicked: 0, errors: [] },
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  slowPages: [],
};

function record(pg, status, msg, detail = "") {
  const entry = { page: pg, status, message: msg };
  if (detail) entry.detail = detail;
  if (status === "PASS") results.passed.push(entry);
  else if (status === "FAIL") results.failed.push(entry);
  else if (status === "SKIP") results.skipped.push(entry);
  else results.warnings.push(entry);
}

// ── Event listeners ────────────────────────────────────────────────

function attachListeners(page, label) {
  const consoleHandler = (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/sentry\.io/i.test(text) && /failed|error/i.test(text)) return;
    results.consoleErrors.push({ page: label, text, url: msg.location().url });
  };
  const errorHandler = (err) => {
    results.pageErrors.push({ page: label, message: err.message, stack: err.stack });
  };
  const respHandler = (resp) => {
    const url = resp.url();
    const status = resp.status();
    if (status >= 400) {
      if (/sentry\.io/i.test(url)) return;
      if (status === 404 && /favicon/i.test(url)) return;
      results.failedRequests.push({ page: label, url, status });
    }
  };
  page.on("console", consoleHandler);
  page.on("pageerror", errorHandler);
  page.on("response", respHandler);
  return () => {
    page.off("console", consoleHandler);
    page.off("pageerror", errorHandler);
    page.off("response", respHandler);
  };
}

// ── Navigation helpers ─────────────────────────────────────────────

async function safeGoto(page, url, label) {
  const start = performance.now();
  try {
    const resp = await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT });
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);
    if (Number.parseFloat(elapsed) > 5) {
      results.slowPages.push({ page: label, url, seconds: elapsed });
    }
    if (resp && resp.status() >= 400) {
      record(label, "FAIL", `HTTP ${resp.status()}`, url);
      return false;
    }
    return true;
  } catch (err) {
    record(label, "FAIL", `Navigation error: ${err.message}`, url);
    return false;
  }
}

async function safeClick(page, label, element, description) {
  results.interactions.total++;
  try {
    await element.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await element.click({ timeout: 3000 });
    results.interactions.clicked++;
    return true;
  } catch (err) {
    results.interactions.errors.push({ page: label, element: description, error: err.message.substring(0, 80) });
    return false;
  }
}

async function safeTypeAndClear(page, label, input, text, description) {
  results.interactions.total++;
  try {
    await input.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await input.click({ timeout: 3000 }).catch(() => {});
    await input.fill(text);
    await page.waitForTimeout(200);
    await input.clear();
    results.interactions.clicked++;
    return true;
  } catch (err) {
    results.interactions.errors.push({ page: label, element: description, error: err.message.substring(0, 80) });
    return false;
  }
}

// ── Interaction sub‑helpers (extracted to reduce cognitive complexity) ──

async function clickExpandButtons(page, label) {
  const expandBtns = page.locator('button[aria-expanded="false"]:visible');
  const expandCount = await expandBtns.count();
  for (let i = 0; i < Math.min(expandCount, 6); i++) {
    const btn = expandBtns.nth(i);
    const name = await btn.getAttribute("aria-label") || (await btn.textContent())?.trim() || `expand-${i}`;
    await safeClick(page, label, btn, name);
    await page.waitForTimeout(300);
  }
}

async function clickTabs(page, label) {
  const tabs = page.locator('[role="tab"]:visible');
  const tabCount = await tabs.count();
  for (let i = 0; i < Math.min(tabCount, 4); i++) {
    const tab = tabs.nth(i);
    const name = (await tab.textContent())?.trim() || `tab-${i}`;
    await safeClick(page, label, tab, name);
    await page.waitForTimeout(300);
  }
  if (tabCount > 1) {
    await safeClick(page, label, tabs.first(), "back-to-first-tab");
    await page.waitForTimeout(200);
  }
}

async function clickSearchInputs(page, label) {
  const searchInputs = page.locator('input[type="search"]:visible, input[placeholder*="Cari"]:visible, #account-search:visible, #product-search:visible');
  const searchCount = await searchInputs.count();
  for (let i = 0; i < Math.min(searchCount, 2); i++) {
    const inp = searchInputs.nth(i);
    const placeholder = await inp.getAttribute("placeholder") || "search";
    await safeTypeAndClear(page, label, inp, "test", placeholder);
  }
}

async function clickClearButtons(page, label) {
  const clearBtns = page.getByRole("button", { name: /hapus pencarian/i });
  if (await clearBtns.count() > 0) {
    await safeClick(page, label, clearBtns.first(), "clear-search");
    await page.waitForTimeout(200);
  }
}

async function clickGroupFilterButtons(page, label) {
  const groupBtns = page.locator('[role="group"] button:visible');
  const groupCount = await groupBtns.count();
  for (let i = 0; i < Math.min(groupCount, 4); i++) {
    const btn = groupBtns.nth(i);
    const name = (await btn.textContent())?.trim() || `group-${i}`;
    await safeClick(page, label, btn, name);
    await page.waitForTimeout(200);
  }
}

async function clickDisclosureToggles(page, label) {
  const disclosure = page.getByRole("button", { name: /lihat|sembunyikan/i });
  const discCount = await disclosure.count();
  for (let i = 0; i < Math.min(discCount, 3); i++) {
    await safeClick(page, label, disclosure.nth(i), "disclosure-toggle");
    await page.waitForTimeout(300);
  }
}

async function clickExportButton(page, label) {
  const exportBtns = page.locator('button:has-text("Ekspor"):visible');
  if (await exportBtns.count() > 0) {
    await safeClick(page, label, exportBtns.first(), "export-button");
    await page.waitForTimeout(500);
  }
}

async function clickModalTriggers(page, label) {
  const modalBtns = page.locator('button[aria-label^="Edit"]:visible, button[aria-label^="Tambah"]:visible');
  const modalCount = await modalBtns.count();
  for (let i = 0; i < Math.min(modalCount, 2); i++) {
    const btn = modalBtns.nth(i);
    const name = await btn.getAttribute("aria-label") || "modal-trigger";
    const ok = await safeClick(page, label, btn, name);
    if (ok) {
      await page.waitForTimeout(500);
      try {
        const closeBtn = page.locator('dialog[open] button[aria-label*="tutup"], dialog[open] button[aria-label*="batal"], dialog[open] button:has-text("Batal")').first();
        if (await closeBtn.count() > 0) {
          await safeClick(page, label, closeBtn, "close-modal");
        } else {
          await page.keyboard.press("Escape");
        }
        await page.waitForTimeout(300);
      } catch { /* ignore close errors */ }
    }
  }
}

async function clickMenuButton(page, label) {
  const menuBtn = page.getByRole("button", { name: /buka menu/i });
  if (await menuBtn.count() > 0) {
    await safeClick(page, label, menuBtn.first(), "open-menu");
    await page.waitForTimeout(500);
    const menuLinks = page.locator('a[href*="/reports/"]:visible, a[href*="/settings/"]:visible').first();
    if (await menuLinks.count() > 0) {
      record(label, "PASS", "Menu nav items visible");
    }
    const closeBtn = page.getByRole("button", { name: /tutup menu/i });
    if (await closeBtn.count() > 0) {
      await safeClick(page, label, closeBtn.first(), "close-menu");
      await page.waitForTimeout(300);
    }
  }
}

async function closeOpenDialogs(page) {
  const openDialogs = page.locator("dialog[open]");
  if (await openDialogs.count() > 0) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Interact with visible elements on the page. */
async function interactWithPage(page, label) {
  await clickExpandButtons(page, label);
  await clickTabs(page, label);
  await clickSearchInputs(page, label);
  await clickClearButtons(page, label);
  await clickGroupFilterButtons(page, label);
  await clickDisclosureToggles(page, label);
  await clickExportButton(page, label);
  await clickModalTriggers(page, label);
  await clickMenuButton(page, label);
  await closeOpenDialogs(page);
}

// ── Login via API (same as auth fixture) ───────────────────────────
async function loginViaAPI(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await page.waitForTimeout(500);

  const loginResult = await page.evaluate(
    async ({ email, password }) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, status: 0, error: String(err) };
      }
    },
    { email: EMAIL, password: PASSWORD },
  );

  if (!loginResult.ok) {
    throw new Error(`Login via API failed (${loginResult.status})`);
  }

  // Navigate to dashboard to establish session in SPA
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log("│ ✅ Login via API berhasil                           │");

  // Verify cookies
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find(c => c.name.includes("session") || c.name.includes("token") || c.name.includes("auth"));
  if (sessionCookie) {
    const preview = sessionCookie.value.substring(0, 20);
    console.log(`│   Session cookie: ${preview}...          │`);
  }
}

// ── Fetch data IDs for detail pages ────────────────────────────────
async function fetchDataIDs(page) {
  const ids = { transactions: [], invoices: [] };

  try {
    const txns = await page.evaluate(async () => {
      const res = await fetch("/api/transactions?limit=10&offset=0");
      if (!res.ok) return [];
      const data = await res.json();
      return (data.transactions || []).map(t => t.id).filter(Boolean);
    });
    ids.transactions = txns.slice(0, 3);
  } catch (e) {
    console.log(`  ⚠️ Could not fetch transactions: ${e.message}`);
  }

  try {
    const invs = await page.evaluate(async () => {
      const res = await fetch("/api/invoices?limit=5");
      if (!res.ok) return [];
      const data = await res.json();
      return (data.invoices || []).map(i => i.id).filter(Boolean);
    });
    ids.invoices = invs.slice(0, 2);
  } catch (e) {
    console.log(`  ⚠️ Could not fetch invoices: ${e.message}`);
  }

  return ids;
}

// ── Test a single page ─────────────────────────────────────────────
async function testPage(page, label, path, isProtected = false) {
  process.stdout.write(`  🔍 ${label.padEnd(32)} `);
  const cleanup = attachListeners(page, label);

  const ok = await safeGoto(page, path, label);
  if (!ok) {
    console.log("❌");
    cleanup();
    return;
  }

  await page.waitForTimeout(isProtected ? PAGE_WAIT : 500);

  const url = page.url();
  if (url.includes("/login") && isProtected) {
    console.log("🔒");
    record(label, "WARN", "Redirected to login — session expired");
    cleanup();
    return;
  }

  try {
    await Promise.race([
      interactWithPage(page, label),
      new Promise(r => setTimeout(r, 12000)),
    ]);
  } catch { /* interaction timeout — still count as visited */ }

  await page.waitForTimeout(300);

  const errs = results.consoleErrors.filter(e => e.page === label).length +
               results.pageErrors.filter(e => e.page === label).length +
               results.failedRequests.filter(e => e.page === label).length;

  if (errs === 0) {
    console.log("✅");
    record(label, "PASS", "OK");
  } else {
    console.log(`⚠️  (${errs} issues)`);
  }
  cleanup();
}

// ── Detail-pages sub‑routines (extracted to reduce main complexity) ──

async function scanTransactionDetails(page, ids) {
  for (const id of ids.transactions) {
    await testPage(page, `Transaction Detail (${id.substring(0, 8)}...)`, `/transactions/${id}`, true);
  }
  if (ids.transactions.length === 0) {
    console.log("  ⏭️  No transaction IDs available                    ");
  }
}

async function scanInvoiceDetails(page, ids) {
  for (const id of ids.invoices) {
    await testPage(page, `Invoice Detail (${id.substring(0, 8)}...)`, `/invoices/${id}`, true);
  }
  if (ids.invoices.length === 0) {
    console.log("  ⏭️  No invoice IDs available                       ");
  }
}

async function fetchAgingData(page) {
  return await page.evaluate(async () => {
    const res = await fetch("/api/reports/aging");
    if (!res.ok) return null;
    return await res.json();
  });
}

function extractPartyIdsFromAging(agingData) {
  const partyIds = [];
  for (const cat of ["receivables", "payables"]) {
    const items = agingData[cat] || [];
    for (const item of items) {
      if (item.partyId) partyIds.push(item.partyId);
    }
  }
  return partyIds;
}

async function scanPartyStatement(page) {
  let agingData;
  try {
    agingData = await fetchAgingData(page);
  } catch (e) {
    console.log(`  ⏭️  Could not fetch aging data: ${e.message}        `);
    return;
  }
  if (!agingData) {
    console.log("  ⏭️  Aging report API returned no data             ");
    return;
  }
  const partyIds = extractPartyIdsFromAging(agingData);
  if (partyIds.length === 0) {
    console.log("  ⏭️  No party IDs found in aging report            ");
    return;
  }
  await testPage(page, `Party Statement (${partyIds[0].substring(0, 8)}...)`, `/reports/aging/${partyIds[0]}`, true);
}

// ── Report ─────────────────────────────────────────────────────────

function printFailedPages() {
  if (results.failed.length === 0) return;
  console.log("\n❌ FAILED PAGES:");
  for (const f of results.failed) {
    const suffix = f.detail ? ` (${f.detail})` : "";
    console.log(`   • ${f.page}: ${f.message}${suffix}`);
  }
}

function printWarnings() {
  if (results.warnings.length === 0) return;
  console.log("\n⚠️  WARNINGS:");
  for (const w of results.warnings) {
    console.log(`   • ${w.page}: ${w.message}`);
  }
}

function printConsoleErrors() {
  if (results.consoleErrors.length === 0) return;
  console.log("\n⚠️  CONSOLE ERRORS:");
  for (const ce of results.consoleErrors.slice(0, 15)) {
    console.log(`   [${ce.page}] ${ce.text.substring(0, 100)}`);
  }
  if (results.consoleErrors.length > 15) {
    const extra = results.consoleErrors.length - 15;
    console.log(`   ... +${extra} more`);
  }
}

function printFailedRequests() {
  if (results.failedRequests.length === 0) return;
  console.log("\n🌐 FAILED REQUESTS:");
  for (const fr of results.failedRequests.slice(0, 10)) {
    console.log(`   [${fr.page}] HTTP ${fr.status} — ${fr.url.substring(0, 80)}`);
  }
  if (results.failedRequests.length > 10) {
    const extra = results.failedRequests.length - 10;
    console.log(`   ... +${extra} more`);
  }
}

async function saveReport(reportPath) {
  const summary = {
    passed: results.passed.length,
    failed: results.failed.length,
    warnings: results.warnings.length,
    skipped: results.skipped.length,
    totalPages: results.passed.length + results.failed.length + results.warnings.length + results.skipped.length,
    totalInteractions: results.interactions.total,
    interactionsClicked: results.interactions.clicked,
    interactionErrors: results.interactions.errors.length,
    consoleErrors: results.consoleErrors.length,
    pageErrors: results.pageErrors.length,
    failedRequests: results.failedRequests.length,
    slowPages: results.slowPages.length,
  };

  console.log(`\n📊 PAGES:         ${summary.passed} ✅ PASS  |  ${summary.failed} ❌ FAIL  |  ${summary.warnings} ⚠️ WARN  |  ${summary.skipped} ⏭️ SKIP`);
  console.log(`🖱️ INTERACTIONS:  ${summary.interactionsClicked} clicked  |  ${summary.interactionErrors} errors`);
  console.log(`🌐 HTTP ERRORS:   ${summary.failedRequests} failed requests`);
  console.log(`❌ JS ERRORS:     ${summary.pageErrors} uncaught`);
  console.log(`⚠️ CONSOLE:       ${summary.consoleErrors} errors`);
  console.log(`🐌 SLOW PAGES:    ${summary.slowPages}`);

  printFailedPages();
  printWarnings();
  printConsoleErrors();
  printFailedRequests();

  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    target: BASE_URL,
    account: EMAIL,
    summary,
    details: results,
  }, null, 2));
  console.log(`\n📝 Laporan lengkap: ${reportPath}`);
}

// ── Initial login handler ──────────────────────────────────────────

async function handleLogin(page, browser) {
  console.log("┌─ LOGIN ──────────────────────────────────────────────┐");
  try {
    await loginViaAPI(page);
  } catch (err) {
    console.log(`│ ❌ ${err.message.padEnd(45)}│`);
    record("LOGIN", "FAIL", err.message);
    const reportPath = resolve(__dirname, "e2e-scan-report.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      target: BASE_URL,
      account: EMAIL,
      error: "Login failed",
      summary: results,
    }, null, 2));
    await browser.close();
    console.log("└──────────────────────────────────────────────────────┘\n");
    console.log("Scan dihentikan karena login gagal.\n");
    return false;
  }
  console.log("└──────────────────────────────────────────────────────┘\n");
  return true;
}

// ── Page scanners (public, protected) ──────────────────────────────

async function scanPublicPages(page) {
  const PUBLIC = [
    "/", "/register", "/forgot-password", "/reset-password",
    "/privacy", "/terms", "/refund", "/security", "/contact",
  ];
  const PUBLIC_LABELS = [
    "Landing", "Register", "Forgot Password", "Reset Password",
    "Privacy Policy", "Terms of Service", "Refund Policy", "Security", "Contact",
  ];
  console.log("┌─ PUBLIC PAGES ───────────────────────────────────────┐");
  for (let i = 0; i < PUBLIC.length; i++) {
    await testPage(page, PUBLIC_LABELS[i], PUBLIC[i], false);
  }
  console.log("└──────────────────────────────────────────────────────┘\n");
}

async function scanProtectedPages(page) {
  const PROTECTED = [
    { path: "/dashboard",               label: "Dashboard" },
    { path: "/transactions",            label: "Transactions List" },
    { path: "/transactions/new",        label: "New Transaction" },
    { path: "/accounts",                label: "Accounts" },
    { path: "/products",                label: "Products" },
    { path: "/invoices",                label: "Invoices List" },
    { path: "/invoices/new",            label: "New Invoice" },

    { path: "/notifications",           label: "Notifications" },
    { path: "/reports/general-ledger",  label: "General Ledger" },
    { path: "/reports/trial-balance",   label: "Trial Balance" },
    { path: "/reports/profit-loss",     label: "Profit & Loss" },
    { path: "/reports/balance-sheet",   label: "Balance Sheet" },
    { path: "/reports/cash-flow",       label: "Cash Flow" },
    { path: "/reports/aging",           label: "Aging Report" },
    { path: "/reconciliation",          label: "Reconciliation" },
    { path: "/opening-balance",         label: "Opening Balance" },
    { path: "/import",                  label: "Import Data" },
    { path: "/settings/team",           label: "Team Settings" },
    { path: "/settings/period-locks",   label: "Period Locks" },
    { path: "/journals",                label: "Manual Journals" },
    { path: "/onboarding",              label: "Onboarding" },
    { path: "/onboarding/checklist",    label: "Onboarding Checklist" },
  ];
  console.log("┌─ PROTECTED PAGES (dashboard area) ───────────────────┐");
  for (const pg of PROTECTED) {
    await testPage(page, pg.label, pg.path, true);
  }
  console.log("└──────────────────────────────────────────────────────┘\n");
}

async function scanDetailPages(page, ids) {
  console.log("┌─ DETAIL PAGES (dynamic routes) ──────────────────────┐");
  await scanTransactionDetails(page, ids);
  await scanInvoiceDetails(page, ids);
  await scanPartyStatement(page);
  console.log("└──────────────────────────────────────────────────────┘\n");
}

async function scanSpecialPages(page) {
  console.log("┌─ SPECIAL PAGES ──────────────────────────────────────┐");
  await testPage(page, "Auth Callback", "/auth/callback", false);
  await testPage(page, "Accept Invitation", "/invitations/accept", false);
  console.log("└──────────────────────────────────────────────────────┘\n");
}

async function displayHeader() {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   Ledjer — COMPREHENSIVE E2E Interactive Page Scan    ║`);
  console.log(`║   Target : ${BASE_URL.padEnd(39)}║`);
  console.log(`║   Account: ${EMAIL.padEnd(39)}║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  await displayHeader();

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    viewport: { width: 375, height: 812 },
  });

  const page = await context.newPage();

  const loginOk = await handleLogin(page, browser);
  if (!loginOk) return;

  console.log("┌─ FETCH DATA IDs untuk detail pages ──────────────────┐");
  const ids = await fetchDataIDs(page);
  console.log(`│   Transactions: ${ids.transactions.length}        Invoices: ${ids.invoices.length}          │`);

  console.log("└──────────────────────────────────────────────────────┘\n");

  await scanPublicPages(page);
  await scanProtectedPages(page);
  await scanDetailPages(page, ids);
  await scanSpecialPages(page);

  const reportPath = resolve(__dirname, "e2e-scan-report.json");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                       LAPORAN HASIL                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  await saveReport(reportPath);

  await browser.close();
  console.log("\n✅ Scan selesai!\n");
}

try {
  await main();
} catch (err) {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
}
