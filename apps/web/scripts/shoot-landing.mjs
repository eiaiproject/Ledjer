import { chromium } from "/Users/irawananggie/Documents/Ledjer/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
const url = "http://localhost:4173/";
const out = process.argv[2] || "/tmp/landing-after";
const browser = await chromium.launch();
const vps = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-320", width: 320, height: 568 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
for (const vp of vps) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}-${vp.name}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log("done");
