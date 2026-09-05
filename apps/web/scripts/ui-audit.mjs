#!/usr/bin/env node
/**
 * Ledjer UI audit - Playwright (standalone, no test runner).
 *
 * Visits every page (public + authenticated) at several viewports, captures
 * full-page screenshots, and runs automated layout/UX checks:
 *   - horizontal overflow (scrollWidth > clientWidth)
 *   - console errors / page errors / failed requests
 *   - duplicate element ids
 *   - <img> without alt
 *   - buttons/links/roles without an accessible name
 *   - interactive targets smaller than the 24px touch-target minimum (mobile)
 *   - design consistency: heading outline (single h1, no skipped levels) and
 *     equal column widths on uniform grids
 *
 * Pixel-perfect review note: the MVP repo ships no committed visual baselines
 * (toHaveScreenshot snapshots), so this audit captures fresh reference
 * screenshots for human review instead of diffing. A future run can seed
 * baselines from the artifacts folder.
 *
 * Prerequisites (all local):
 *   pnpm --filter web db:migrations:apply:local
 *   bash scripts/seed-e2e-local.sh
 *   LEDJER_E2E_LOCAL=1 LEDJER_CSP_LOCAL=1 pnpm --filter web build
 *   LEDJER_E2E_LOCAL=1 pnpm --filter web preview   # port 4173
 *
 * Usage (from apps/web):
 *   node scripts/ui-audit.mjs
 *   AUDIT_OUT=./.audit node scripts/ui-audit.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.AUDIT_BASE_URL || "http://localhost:4173";
const outDir = process.env.AUDIT_OUT || path.join(os.tmpdir(), "ledjer-ui-audit");

const EMAIL = process.env.AUDIT_EMAIL || "ledjer@yopmail.com";
const PASSWORD = process.env.AUDIT_PASSWORD || "Ledjer26#";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const PUBLIC_ROUTES = [
  { path: "/", slug: "landing" },
  { path: "/login", slug: "login" },
  { path: "/register", slug: "register" },
  { path: "/nonexistent-xyz", slug: "not-found" },
];

let authedRoutes = [
  { path: "/dashboard", slug: "dashboard" },
  { path: "/transactions", slug: "transactions-list" },
  { path: "/transactions/new", slug: "transactions-new" },
  { path: "/accounts", slug: "accounts" },
  { path: "/reports/profit-loss", slug: "report-profit-loss" },
  { path: "/reports/balance-sheet", slug: "report-balance-sheet" },
  { path: "/reports/general-ledger", slug: "report-general-ledger" },
  { path: "/settings", slug: "settings" },
];

async function waitAppStable(page, timeout = 20_000) {
  try {
    await page.waitForFunction(
      () => {
        const root = document.getElementById("root");
        if (!root || root.children.length === 0) return false;
        const loading = !!document.querySelector(
          '.animate-pulse, [aria-busy="true"], [data-testid="skeleton"], output[aria-live="polite"]',
        );
        if (loading) return false;
        // Ignore infinite animations (e.g. ledger-soft-float); wait for finite
        // entrance animations to finish so screenshots are not mid-fade.
        return Array.from(document.getAnimations()).every((a) => {
          const timing = a.effect?.getTiming?.();
          if (!timing) return true;
          if (timing.iterations === Infinity) return false;
          return a.playState === "finished";
        });
      },
      undefined,
      { timeout },
    );
  } catch {
    // Loading may legitimately not settle; fall back to what is rendered.
  }
  await page.waitForTimeout(300);
}

function runDesignChecks(page) {
  // Design-consistency regression guards:
  //   1. Heading outline: exactly one h1, the first heading must be h1, and
  //      levels must not skip (e.g. h1 -> h3 without an h2 in between).
  //   2. Uniform grids (equal template tracks where every child spans a single
  //      column) must render children at equal widths - catches spacing/span
  //      regressions like a col-span landing on the wrong element.
  return page.evaluate(() => {
    const checkHeadings = () => {
      const issues = [];
      const heads = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          txt: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
        }));
      if (heads.length === 0) {
        issues.push({ kind: "design-heading", detail: "page has no headings" });
        return issues;
      }
      if (heads[0].tag !== "h1") {
        issues.push({ kind: "design-heading", detail: `first heading is ${heads[0].tag} (not h1): "${heads[0].txt}"` });
      }
      const h1s = heads.filter((n) => n.tag === "h1");
      if (h1s.length !== 1) issues.push({ kind: "design-heading", detail: `h1 count is ${h1s.length} (expected 1)` });
      let prev = 0;
      for (const n of heads) {
        const lvl = Number(n.tag[1]);
        if (prev && lvl > prev + 1) issues.push({ kind: "design-heading", detail: `level skip ${prev}->${lvl}: "${n.txt}"` });
        prev = lvl;
      }
      return issues;
    };

    const checkGrids = () => {
      const issues = [];
      const uneven = [];
      for (const g of document.querySelectorAll("div")) {
        if (!/grid/.test(g.className || "")) continue;
        const style = window.getComputedStyle(g);
        if (style.display !== "grid") continue;
        const kids = [...g.children].filter((c) => c.getBoundingClientRect().width > 0);
        if (kids.length < 3) continue;
        // Skip intentionally uneven templates (e.g. [1fr_1fr_auto] toolbars).
        const cols = style.gridTemplateColumns.split(" ").map((v) => Number.parseFloat(v));
        if (new Set(cols).size > 1) continue;
        // Skip layouts where children span multiple tracks on purpose.
        const spans = kids.map((c) => {
          const s = window.getComputedStyle(c);
          const a = Number.parseInt(s.gridColumnStart, 10);
          const b = Number.parseInt(s.gridColumnEnd, 10);
          return Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
        });
        if (spans.some((v) => v !== 1)) continue;
        const ws = kids.map((c) => c.getBoundingClientRect().width);
        if (Math.max(...ws) - Math.min(...ws) > 3) {
          uneven.push(`${g.className.toString().replace(/\s+/g, " ").slice(0, 70)} -> ${ws.map((w) => Math.round(w)).join("/")}`);
        }
      }
      if (uneven.length) issues.push({ kind: "design-grid", detail: uneven.slice(0, 3).join(" | ") });
      return issues;
    };

    return { issues: [...checkHeadings(), ...checkGrids()] };
  });
}

function runChecks(page) {
  return page.evaluate(() => {
    const issues = [];
    const firstText = (els, n = 3) =>
      els.slice(0, n).map((el) => {
        const name = el.getAttribute("aria-label")
          || el.getAttribute("title")
          || (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
        return name || el.tagName.toLowerCase();
      });

    // 1. Horizontal overflow (root scroller + fixed elements)
    const rootOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const bodyOverflow = document.body.scrollWidth - document.body.clientWidth;
    const overflowers = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return false;
      const style = window.getComputedStyle(el);
      if (style.position === "fixed") return false;
      const right = r.right - document.documentElement.clientWidth;
      return right > 1 && !style.overflowX.includes("auto") && !style.overflowX.includes("hidden");
    }).slice(0, 5);
    if (rootOverflow > 1 || bodyOverflow > 1) {
      issues.push({
        kind: "horizontal-overflow",
        detail: `root:+${rootOverflow}px body:+${bodyOverflow}px`,
        elements: firstText(overflowers),
      });
    }

    // 2. Duplicate ids
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dupIds.length) issues.push({ kind: "duplicate-ids", detail: dupIds.join(", ") });

    // 3. Images without alt
    const noAlt = [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt"));
    if (noAlt.length) issues.push({ kind: "img-without-alt", detail: `${noAlt.length}`, elements: noAlt.slice(0, 3).map((i) => i.src || "img") });

    // 4. Interactive elements without an accessible name
    const unlabeled = [...document.querySelectorAll('button, [role="button"], a[href]')].filter((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const text = (el.textContent || "").trim();
      const label = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      return !text && !label && !title;
    });
    if (unlabeled.length) issues.push({ kind: "unlabeled-control", detail: `${unlabeled.length}`, elements: firstText(unlabeled) });

    // 5. Tiny touch targets (mobile only - checked from the caller)
    return { issues };
  });
}

async function tinyTouchTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, [role="button"], a[href], input, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      // Skip the intentionally sr-only skip-link (it expands on focus).
      if (el.classList.contains("sr-only")) continue;
      // Skip anchors that merely wrap a real control (the button is the target).
      if (el.tagName === "A" && el.querySelector('button, input, select, textarea, [role="button"]')) continue;
      // Skip inline sentence links (WCAG 2.5.8 exempts text within a sentence).
      if (
        el.tagName === "A"
        && style.display === "inline"
        && (el.closest("p, li, figcaption, label, td, th") || (el.textContent || "").trim().length < 40)
      ) continue;
      if (r.width < 24 || r.height < 24) {
        const label = el.getAttribute("aria-label")
          || el.getAttribute("title")
          || (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
        bad.push({ tag: el.tagName.toLowerCase(), label: label || "(no name)", w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return bad.slice(0, 10);
  });
}

function screenshotName(vp, slug) {
  return `${outDir}/${vp.name}/${vp.width}x${vp.height}-${slug}.png`;
}

const report = { baseUrl, generatedAt: new Date().toISOString(), viewports: VIEWPORTS.map((v) => v.name), results: [] };

async function seedAuditTransaction(context, vp, txnId) {
  const org = await (await context.request.get(`${baseUrl}/api/organizations/current`)).json();
  const orgId = org?.organization?.id;
  if (!orgId) return null;
  const accounts = (await (await context.request.get(`${baseUrl}/api/accounts`)).json()).accounts;
  const cash = accounts.find((a) => a.code === "1110");
  const equity = accounts.find((a) => a.code === "3110");
  if (!cash || !equity) return null;
  const today = new Date().toISOString().slice(0, 10); // UTC date is never "future" in Asia/Jakarta
  const created = await context.request.post(`${baseUrl}/api/transactions`, {
    headers: { Origin: baseUrl },
    data: {
      transactionType: "owner_deposit",
      transactionDate: today,
      cashAccountId: cash.id,
      counterAccountId: equity.id,
      amountIdr: 5_000_000,
      description: "Transaksi audit UI",
      idempotencyKey: `audit-${vp.name}-${randomUUID()}`,
    },
  });
  if (!created.ok()) return { seedError: `create tx failed: ${created.status()}` };
  const body = await created.json();
  if (!txnId.value) txnId.value = body.transaction_id;
  return null;
}

async function auditViewport(browser, vp, txnId) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  });
  const page = await context.newPage();

  const row = { viewport: vp.name, width: vp.width, height: vp.height, routes: [] };

  // Public routes (no session needed)
  for (const route of PUBLIC_ROUTES) {
    const entry = await auditRoute(page, vp, route);
    row.routes.push(entry);
  }

  // Authenticate once per viewport. Send an Origin header like a real
  // browser: the worker's CSRF check (worker/index.ts, ADR 0003) rejects
  // state-changing requests that carry a session cookie but no allowed
  // Origin, so cookie-authenticated POSTs from a bare request context
  // (which omits Origin) would 403 against hardened deployments.
  const login = await context.request.post(`${baseUrl}/api/auth/login`, {
    headers: { Origin: baseUrl },
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!login.ok()) {
    row.authError = `login failed: ${login.status()} ${(await login.text()).slice(0, 200)}`;
    await context.close();
    return row;
  }

  // Seed today's transaction once per context so reports/GL have data and
  // the transaction detail page can be audited.
  const seed = await seedAuditTransaction(context, vp, txnId);
  if (seed?.seedError) row.seedError = seed.seedError;
  if (txnId.value && !authedRoutes.some((r) => r.slug === "transactions-detail")) {
    authedRoutes = [...authedRoutes, { path: `/transactions/${txnId.value}`, slug: "transactions-detail" }];
  }
  for (const route of authedRoutes) {
    const entry = await auditRoute(page, vp, route);
    row.routes.push(entry);
  }

  await context.close();
  return row;
}

async function auditRoute(page, vp, route) {
  const errors = { console: [], page: [], failed: [] };
  const onConsole = (msg) => { if (msg.type() === "error") errors.console.push(msg.text().slice(0, 300)); };
  const onPageError = (err) => errors.page.push(String(err).slice(0, 300));
  const onFailed = (req) => errors.failed.push(`${req.method()} ${req.url()} ${req.failure()?.errorText ?? ""}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onFailed);

  const entry = { path: route.path, slug: route.slug, screenshot: null, issues: [] };
  try {
    const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    entry.status = response?.status() ?? "n/a";
    await waitAppStable(page);
    await page.waitForTimeout(400);

    mkdirSync(`${outDir}/${vp.name}`, { recursive: true });
    const shot = screenshotName(vp, route.slug);
    await page.screenshot({ path: shot, fullPage: true });
    entry.screenshot = shot;

    const { issues } = await runChecks(page);
    const design = await runDesignChecks(page);
    entry.issues.push(...design.issues);
    if (vp.name === "mobile") {
      const tiny = await tinyTouchTargets(page);
      if (tiny.length) issues.push({ kind: "tiny-touch-target", detail: tiny.map((t) => `${t.tag} "${t.label}" ${t.w}x${t.h}`).join(" | ") });
    }
    entry.issues = issues;
    entry.issues.push(
      ...(errors.console.length ? [{ kind: "console-error", detail: errors.console.join(" | ") }] : []),
      ...(errors.page.length ? [{ kind: "page-error", detail: errors.page.join(" | ") }] : []),
      ...(errors.failed.length ? [{ kind: "failed-request", detail: errors.failed.join(" | ") }] : []),
    );
  } catch (err) {
    entry.issues.push({ kind: "audit-failure", detail: String(err).slice(0, 300) });
  } finally {
    page.removeListener("console", onConsole);
    page.removeListener("pageerror", onPageError);
    page.removeListener("requestfailed", onFailed);
  }
  return entry;
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const txnId = { value: null };
for (const vp of VIEWPORTS) {
  const row = await auditViewport(browser, vp, txnId);
  report.results.push(row);
  console.log(`[${vp.name}] ${row.routes.length} routes audited`);
}
await browser.close();

writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(`\nReport: ${outDir}/report.json`);

// ── Console summary ─────────────────────────────────────────────
let totalIssues = 0;
for (const row of report.results) {
  for (const route of row.routes) {
    const kinds = {};
    for (const issue of route.issues) kinds[issue.kind] = (kinds[issue.kind] ?? 0) + 1;
    totalIssues += route.issues.length;
    if (route.issues.length) {
      console.log(`✗ [${row.viewport}/${row.width}x${row.height}] ${route.path} -> ${JSON.stringify(kinds)}`);
    } else {
      console.log(`✓ [${row.viewport}] ${route.path}`);
    }
  }
}
console.log(`\nTotal issues: ${totalIssues}`);
console.log(`Screenshots: ${outDir}/<viewport>/<width>x<height>-<slug>.png`);
