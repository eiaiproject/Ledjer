// Quick baseline measurement for the landing page.
// Usage: node scripts/measure-landing.mjs [url]
import { chromium } from "/Users/irawananggie/Documents/Ledjer/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";

const url = process.argv[2] ?? "http://localhost:4173/";

const viewports = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-414", width: 414, height: 915 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const browser = await chromium.launch();
const report = {};
try {
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const failed = [];
    page.on("console", (m) => {
      if (m.type() === "error") {
        const t = m.text();
        if (!/sentry\.io/i.test(t)) consoleErrors.push(t);
      }
    });
    page.on("requestfailed", (r) => {
      const u = r.url();
      if (!/sentry\.io/i.test(u)) failed.push(u);
    });
    await page.goto(url, { waitUntil: "networkidle" });
    const data = await page.evaluate(() => {
      const h1 = document.querySelectorAll("h1").length;
      const main = document.querySelectorAll("main").length;
      const footer = document.querySelectorAll("footer").length;
      const copyrightEls = Array.from(document.querySelectorAll("p, span, small"))
        .filter((el) => /©|copyright/i.test(el.textContent ?? "")).length;
      const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      const sections = document.querySelectorAll("section").length;
      const cards = document.querySelectorAll("[class*='rounded-xl']").length;
      const buttons = document.querySelectorAll("button").length;
      const h = document.documentElement.scrollHeight;
      const vh = window.innerHeight;
      const wv = window.innerWidth;
      const sw = document.documentElement.scrollWidth;
      return {
        h1, main, footer, copyrightEls, dupIds: [...new Set(dup)],
        sections, cards, buttons, height: h, vh, vps: +(h / vh).toFixed(2),
        scrollWidth: sw, overflow: sw > wv,
      };
    });
    report[vp.name] = { ...vp, ...data, consoleErrors, failed };
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
