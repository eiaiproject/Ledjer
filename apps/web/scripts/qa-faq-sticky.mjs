// Verify FAQ last item is not occluded by sticky CTA on mobile.
import { chromium } from "/Users/irawananggie/Documents/Ledjer/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });

// Scroll to FAQ
await page.evaluate(() => {
  const faq = document.querySelector('[aria-labelledby="faq-heading"]');
  faq?.scrollIntoView({ block: "start" });
});
await page.waitForTimeout(400);

// Open all FAQ items
const triggers = await page.locator('[id^="faq-button-"]').all();
for (const t of triggers) await t.click();
await page.waitForTimeout(200);

// Scroll to the last item
await page.evaluate(() => {
  const last = document.querySelector('[id^="faq-button-"]:nth-of-type(1)');
  // Get last by index
  const all = document.querySelectorAll('[id^="faq-button-"]');
  all[all.length - 1]?.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(300);

// Get last panel + sticky CTA rects
const data = await page.evaluate(() => {
  const all = document.querySelectorAll('[id^="faq-button-"]');
  const lastBtn = all[all.length - 1];
  const lastPanel = lastBtn.parentElement?.parentElement?.querySelector('dd');
  const sticky = document.querySelector('[aria-label="Mulai Gratis (cta melekat)"]');
  const lastRect = lastPanel?.getBoundingClientRect();
  const stickyRect = sticky?.getBoundingClientRect();
  const vh = window.innerHeight;
  return {
    lastPanelBottom: lastRect?.bottom,
    stickyTop: stickyRect?.top,
    vh,
    occluded: !!(lastRect && stickyRect && lastRect.bottom > stickyRect.top),
  };
});
console.log(JSON.stringify(data, null, 2));
if (data.occluded) {
  console.log("FAIL: last FAQ occluded by sticky CTA");
  process.exitCode = 1;
} else {
  console.log("PASS: last FAQ not occluded");
}
await browser.close();
