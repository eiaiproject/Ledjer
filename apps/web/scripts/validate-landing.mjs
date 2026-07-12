import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.VALIDATE_URL || "http://localhost:4173/";
const PHASE = process.env.PHASE || "before";
const OUT = path.resolve(process.cwd(), "validation", PHASE);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-412", width: 412, height: 915 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const clsInit = () => {
  window.__cls = 0;
  window.__clsEntries = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          window.__cls += e.value;
          window.__clsEntries += 1;
        }
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch (e) {}
};

const report = { phase: PHASE, url: BASE, viewports: {}, issues: [] };
const consoleErrors = [];
const pageErrors = [];
const networkFailures = [];

function issue(sev, cat, msg, detail) {
  report.issues.push({ sev, cat, msg, detail: detail ?? null });
  console.error(`[${sev}] ${cat}: ${msg}`);
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function newCtx(opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport,
    deviceScaleFactor: opts.dpr || 1,
    reducedMotion: opts.reducedMotion || null,
    baseURL: BASE,
  });
  ctx.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  ctx.on("pageerror", (e) => pageErrors.push(String(e)));
  ctx.on("requestfailed", (r) =>
    networkFailures.push({ url: r.url(), failure: r.failure()?.errorText })
  );
  const page = await ctx.newPage();
  await page.addInitScript(clsInit);
  return { ctx, page };
}

// ---------- Full screenshots per viewport ----------
for (const vp of VIEWPORTS) {
  const { ctx, page } = await newCtx({ viewport: { width: vp.width, height: vp.height } });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1600); // let signature animations settle
  const file = path.join(OUT, `${vp.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.viewports[vp.name] = { width: vp.width, height: vp.height, screenshot: file };
  await ctx.close();
}

// ---------- Detailed interaction checks on a representative mobile + desktop page ----------
async function detailedChecks(vp, reducedMotion = false) {
  const { ctx, page } = await newCtx({
    viewport: { width: vp.width, height: vp.height },
    reducedMotion: reducedMotion ? "reduce" : null,
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(reducedMotion ? 300 : 1600);

  const data = await page.evaluate(() => {
    const doc = document.documentElement;
    const out = {};
    out.scrollWidth = doc.scrollWidth;
    out.clientWidth = doc.clientWidth;
    out.horizontalOverflow = doc.scrollWidth - doc.clientWidth;

    // Off-viewport / overflowing elements (right edge beyond viewport)
    const vw = window.innerWidth;
    const offenders = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.right > vw + 1 && r.left < vw) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.toString().slice(0, 60)) || "",
          id: el.id || "",
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    });
    out.overflowOffenders = offenders.slice(0, 40);

    // Fixed / sticky elements
    const fixed = [];
    document.querySelectorAll("*").forEach((el) => {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") {
        const r = el.getBoundingClientRect();
        fixed.push({
          tag: el.tagName.toLowerCase(),
          pos,
          id: el.id || "",
          cls: (el.className && el.className.toString().slice(0, 60)) || "",
          top: Math.round(r.top),
        });
      }
    });
    out.fixedSticky = fixed;

    // Duplicate DOM ids
    const ids = {};
    const dupIds = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      ids[id] = (ids[id] || 0) + 1;
    });
    Object.entries(ids).forEach(([id, n]) => { if (n > 1) dupIds.push({ id, n }); });
    out.dupIds = dupIds;

    // Anchor links resolving
    const anchors = [];
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      const href = a.getAttribute("href");
      const target = href.length > 1 ? document.querySelector(href) : null;
      anchors.push({ href, ok: !!target });
    });
    out.anchors = anchors;

    // Sticky header bottom (for anchor-obscure check)
    const header = document.querySelector("header");
    out.headerBottom = header ? Math.round(header.getBoundingClientRect().bottom) : 0;

    // Duplicate accessible names from a11y snapshot (collected separately)
    return out;
  });

  // Anchor navigation: click each in-page anchor, check target sits under sticky header
  const navHrefs = ["#fitur", "#cara-kerja", "#laporan", "#tim-izin", "#keamanan", "#harga", "#masalah"];
  const anchorResults = [];
  for (const href of navHrefs) {
    // Pick the first visible anchor for this href (desktop nav hidden on mobile, etc.)
    const handle = await page.evaluateHandle((h) => {
      const list = document.querySelectorAll(`a[href="${h}"]`);
      for (const a of list) {
        const r = a.getBoundingClientRect();
        const s = getComputedStyle(a);
        if (r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden") return a;
      }
      return null;
    }, href);
    const el = handle.asElement();
    if (!el) { anchorResults.push({ href, clicked: false }); continue; }
    await el.click({ force: true });
    await page.waitForTimeout(reducedMotion ? 250 : 700);
  const offRecord = await page.evaluate(({ h, hb }) => {
    const t = document.querySelector(h);
    if (!t) return { href: h, found: false };
    const rect = t.getBoundingClientRect();
    return {
      href: h,
      found: true,
      top: Math.round(rect.top),
      headerBottom: hb,
      obscured: rect.top < hb - 1,
    };
  }, { h: href, hb: data.headerBottom });
    anchorResults.push(offRecord);
  }

  // FAQ accordion toggle
  const faq = await page.$("#faq-button-0");
  let faqResult = { exists: false };
  if (faq) {
    await faq.click();
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => {
      const b = document.querySelector("#faq-button-0");
      const p = document.querySelector("#faq-panel-0");
      return {
        expanded: b?.getAttribute("aria-expanded"),
        panelVisible: p ? !p.hidden && p.offsetParent !== null : false,
      };
    });
    await faq.click();
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => {
      const b = document.querySelector("#faq-button-0");
      const p = document.querySelector("#faq-panel-0");
      return { expanded: b?.getAttribute("aria-expanded"), panelHidden: p?.hidden };
    });
    faqResult = { open, closed };
  }

  // Details disclosure
  const details = await page.$("details summary");
  let detailsResult = { exists: false };
  if (details) {
    await details.click();
    await page.waitForTimeout(300);
    detailsResult = await page.evaluate(() => {
      const d = document.querySelector("details");
      const open = d.hasAttribute("open");
      const content = d.querySelector("div") || d;
      return { open, contentVisible: content.offsetParent !== null };
    });
  }

  // Keyboard-only tab order (first 24 stops)
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.waitForTimeout(100);
  const tabOrder = [];
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const visible = r.top >= -2 && r.bottom <= vh + 2 && r.left >= -2 && r.right <= vw + 2 && r.width > 0;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 50),
        inView: visible,
      };
    });
    tabOrder.push(info);
  }
  const offscreenFocus = tabOrder.filter((t) => !t.inView);

  const cls = await page.evaluate(() => ({ cls: window.__cls || 0, entries: window.__clsEntries || 0 }));

  await ctx.close();
  return {
    viewport: `${vp.width}x${vp.height}`,
    reducedMotion,
    horizontalOverflow: data.horizontalOverflow,
    overflowOffenders: data.overflowOffenders,
    fixedSticky: data.fixedSticky,
    dupIds: data.dupIds,
    brokenAnchors: data.anchors.filter((a) => !a.ok),
    anchorResults,
    faqResult,
    detailsResult,
    tabOrder: tabOrder.map((t) => `${t.tag}#${t.id || "-"}:${t.name}`),
    offscreenFocus,
    cls,
  };
}

report.detailMobile = await detailedChecks({ width: 390, height: 844 });
report.detailDesktop = await detailedChecks({ width: 1440, height: 900 });

// Reduced motion + CLS
{
  const { ctx, page } = await newCtx({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const rm = await page.evaluate(() => ({
    matches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  // navigate anchors under reduced motion
  for (const href of ["#fitur", "#harga", "#keamanan"]) {
    const el = await page.$(`a[href="${href}"]`);
    if (el) { await el.click({ force: true }); await page.waitForTimeout(200); }
  }
  const cls = await page.evaluate(() => ({ cls: window.__cls || 0, entries: window.__clsEntries || 0 }));
  await page.screenshot({ path: path.join(OUT, "reduced-motion.png"), fullPage: true });
  report.reducedMotion = { matches: rm.matches, clsAfterNav: cls };
  await ctx.close();
}

// Browser zoom 200% (simulate via CSS zoom) — desktop
{
  const { ctx, page } = await newCtx({ viewport: { width: 1440, height: 900 } });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await page.waitForTimeout(400);
  const zoom = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflow: doc.scrollWidth - doc.clientWidth };
  });
  await page.screenshot({ path: path.join(OUT, "zoom-200.png"), fullPage: true });
  report.zoom200 = zoom;
  await ctx.close();
}

// Accessibility — compute accessible names for landmarks & interactive elements; flag duplicates.
{
  const { ctx, page } = await newCtx({ viewport: { width: 1440, height: 900 } });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const a11y = await page.evaluate(() => {
    const names = {};
    const dupNames = [];
    const landmarkNames = {};
    const dupLandmarks = [];
    const linkNames = {};
    const dupLinks = [];

    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };
    const accName = (el) => {
      const aria = el.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      const labelledby = el.getAttribute("aria-labelledby");
      if (labelledby) {
        const t = document.getElementById(labelledby);
        if (t) return (t.textContent || "").trim();
      }
      return (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
    };

    document.querySelectorAll("*").forEach((el) => {
      if (!visible(el)) return;
      const tag = el.tagName;
      const role = (el.getAttribute("role") || "").toLowerCase();
      const isLandmark = ["header", "nav", "main", "footer", "aside", "section"].includes(tag) || role === "navigation" || role === "banner" || role === "contentinfo" || role === "main";
      if (isLandmark) {
        const k = `landmark::${role || tag}::${accName(el)}`;
        landmarkNames[k] = (landmarkNames[k] || 0) + 1;
      }
      if (tag === "A" && el.getAttribute("href")) {
        const k = `link::${accName(el)}`;
        linkNames[k] = (linkNames[k] || 0) + 1;
      }
    });

    Object.entries(landmarkNames).forEach(([k, c]) => { if (c > 1) dupLandmarks.push({ name: k, count: c }); });
    Object.entries(linkNames).forEach(([k, c]) => { if (c > 1) dupLinks.push({ name: k, count: c }); });

    // Headings — verify outline
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) => ({
      level: parseInt(h.tagName.slice(1), 10),
      text: (h.textContent || "").trim().slice(0, 80),
    }));

    return { dupLandmarks, dupLinks, headings };
  });
  report.a11yDuplicateNames = a11y.dupLandmarks.concat(a11y.dupLinks.map((l) => ({ name: l.name, count: l.count })));
  report.headings = a11y.headings;
  await ctx.close();
}

report.consoleErrors = consoleErrors;
report.pageErrors = pageErrors;
report.networkFailures = networkFailures;

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
await browser.close();

// Summarize issues
const ai = report.issues;
console.log(`\n=== VALIDATION ${PHASE} COMPLETE ===`);
console.log(`consoleErrors: ${consoleErrors.length}, pageErrors: ${pageErrors.length}, networkFailures: ${networkFailures.length}`);
console.log(`a11y duplicate names: ${report.a11yDuplicateNames.length}`);
console.log(`mobile overflow px: ${report.detailMobile.horizontalOverflow}, desktop overflow px: ${report.detailDesktop.horizontalOverflow}`);
console.log(`zoom200 overflow px: ${report.zoom200.overflow}`);
console.log(`mobile CLS: ${report.detailMobile.cls.cls.toFixed(4)}, desktop CLS: ${report.detailDesktop.cls.cls.toFixed(4)}`);
console.log(`report -> ${path.join(OUT, "report.json")}`);
