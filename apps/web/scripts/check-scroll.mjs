import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const cases = [
  { name: "mobile-390", w: 390, h: 844 },
  { name: "desktop-1440", w: 1440, h: 900 },
];
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Instrument: record every scroll event with position, time, and what triggered it
  await page.evaluate(() => {
    window.__scrollLog = [];
    let lastY = window.scrollY;
    window.addEventListener("scroll", () => {
      window.__scrollLog.push({
        t: Math.round(performance.now()),
        y: window.scrollY,
        delta: window.scrollY - lastY,
      });
      lastY = window.scrollY;
    }, { passive: true });
  });

  // Scroll down slowly in steps, watching for any auto-rebound upward
  for (let i = 0; i < 30; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), 200 * (i + 1));
    await page.waitForTimeout(120);
  }

  // Click on body away from interactive elements to dismiss any tooltips/overlays
  await page.mouse.click(c.w / 2, c.h / 2);
  await page.waitForTimeout(300);

  // Pure wheel scroll (simulate user)
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(800);

  // Now wait 2s and see if scroll Y changes by itself
  const beforeIdle = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(2000);
  const afterIdle = await page.evaluate(() => window.scrollY);

  const log = await page.evaluate(() => window.__scrollLog);
  // Find any negative deltas with magnitude > 50 (real upward jerks, not just focus scrolls)
  const jerks = [];
  for (let i = 1; i < log.length; i++) {
    if (log[i].delta < -40) {
      jerks.push({ from: log[i - 1].y, to: log[i].y, delta: log[i].delta, t: log[i].t });
    }
  }

  // Manual smooth-scroll trigger: what does window.scrollY do if we use the smooth anchor?
  const anchorTest = await page.evaluate(async () => {
    const a = document.querySelector('a[href="#fitur"]');
    const all = Array.from(document.querySelectorAll('a[href="#fitur"]')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0;
    });
    if (!all.length) return { found: false };
    all[0].click();
    await new Promise((r) => setTimeout(r, 1200));
    return { found: true, y: window.scrollY };
  });

  console.log(`\n=== ${c.name} ===`);
  console.log(`total scroll events: ${log.length}`);
  console.log(`upward jerks (delta < -40): ${jerks.length}`);
  if (jerks.length) console.log("jerks:", JSON.stringify(jerks.slice(0, 10)));
  console.log(`idle y before: ${beforeIdle}, after 2s: ${afterIdle}, drift: ${afterIdle - beforeIdle}`);
  console.log(`anchor click → y=${anchorTest.y}`);
  console.log(`first 12 scroll log:`, JSON.stringify(log.slice(0, 12)));
  console.log(`last 8 scroll log:`, JSON.stringify(log.slice(-8)));
  await ctx.close();
}
await browser.close();
