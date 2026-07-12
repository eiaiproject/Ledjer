// Functional + interaction checks for the redesigned landing.
import { chromium } from "/Users/irawananggie/Documents/Ledjer/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";

const url = "http://localhost:4173/";
const browser = await chromium.launch();
const fail = (msg) => { console.error("FAIL:", msg); process.exitCode = 1; };
const pass = (msg) => console.log("PASS:", msg);

try {
  // Mobile interaction checks
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" && !/sentry\.io/i.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.goto(url, { waitUntil: "networkidle" });

  // 1) Hero CTA visible & clickable
  const heroCta = page.getByRole("link", { name: /Mulai Gratis \(.*navigasi utama|cta akhir\)|bilah navigasi|Mulai \(bilah/i }).first();
  if (!(await heroCta.isVisible())) fail("hero CTA not visible");
  else pass("hero CTA visible");

  // 2) Only one business-type panel visible at a time
  const businessTabs = ["toko", "kuliner", "jasa", "distributor"];
  for (const id of businessTabs) {
    const tab = page.getByRole("tab", { name: new RegExp(`^${id === "toko" ? "Toko" : id === "kuliner" ? "Kuliner" : id === "jasa" ? "Jasa" : "Distributor"}`, "i") });
    await tab.click();
    const panel = page.locator(`#panel-${id}`);
    const visible = await panel.isVisible();
    if (!visible) fail(`business tab ${id} panel not visible`);
  }
  pass("business type tabs switch");

  // 3) Report tabs
  const reportLabels = ["Laba Rugi", "Neraca", "Buku Besar", "Neraca Saldo"];
  for (const label of reportLabels) {
    await page.getByRole("tab", { name: new RegExp(`^${label}$`) }).click();
  }
  pass("report tabs switch");

  // 4) FAQ
  const faqButtons = page.locator('[id^="faq-button-"]');
  const count = await faqButtons.count();
  if (count !== 6) fail(`expected 6 FAQ buttons, got ${count}`);
  else pass(`FAQ count = ${count}`);
  await faqButtons.first().click();
  const expanded = await faqButtons.first().getAttribute("aria-expanded");
  if (expanded !== "true") fail("FAQ first item not expanded after click");
  else pass("FAQ toggles aria-expanded");

  // 5) Demo expand
  const demoBtn = page.getByRole("button", { name: /Lihat detail pembukuan|Sembunyikan detail/i });
  await demoBtn.click();
  const demoExpanded = await demoBtn.getAttribute("aria-expanded");
  if (demoExpanded !== "true") fail("demo expand failed");
  else pass("demo expand works");

  // 6) Sticky CTA: visible after scrolling past hero
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(400);
  const sticky = page.getByRole("link", { name: /Mulai Gratis \(cta melekat\)/i });
  const stickyVisible = await sticky.isVisible().catch(() => false);
  if (!stickyVisible) fail("sticky CTA not visible mid-page");
  else pass("sticky CTA visible mid-page");

  // Scroll to bottom — should hide when footer visible
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const stickyVisibleAtBottom = await sticky.isVisible().catch(() => false);
  if (stickyVisibleAtBottom) fail("sticky CTA still visible at bottom");
  else pass("sticky CTA hides at bottom");

  // 7) Keyboard tab through page
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  pass("keyboard tab traversal ok");

  // 8) No console errors throughout
  if (errs.length) fail("console errors: " + errs.join(" | "));
  else pass("no console errors");

  await ctx.close();

  // Desktop: preview mockup and grid are both visible
  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pd = await ctxD.newPage();
  await pd.goto(url, { waitUntil: "networkidle" });
  const h1 = await pd.locator("h1").first().textContent();
  if (!h1 || !/catat transaksi/i.test(h1)) fail("desktop h1 not as expected: " + h1);
  else pass("desktop h1 ok: " + h1.trim().slice(0, 50));
  await ctxD.close();

  // 9) 320 width — narrowest target
  const ctxN = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const pn = await ctxN.newPage();
  await pn.goto(url, { waitUntil: "networkidle" });
  const sw = await pn.evaluate(() => document.documentElement.scrollWidth);
  const cw = await pn.evaluate(() => window.innerWidth);
  if (sw > cw) fail(`320 overflow: scrollWidth=${sw}, clientWidth=${cw}`);
  else pass("320 width no overflow");
  await ctxN.close();

} catch (e) {
  fail("exception: " + e.message);
} finally {
  await browser.close();
}
console.log(process.exitCode ? "FAILED" : "ALL PASSED");
