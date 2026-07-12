import { chromium, devices } from "@playwright/test";
const browser = await chromium.launch();

// Test on a real mobile user-agent + touch device — no mouse wheel
const m = devices["Pixel 5"];
const ctx = await browser.newContext({ ...m, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  window.__log = [];
  let last = window.scrollY;
  window.addEventListener("scroll", () => {
    window.__log.push({ t: Math.round(performance.now()), y: window.scrollY, d: window.scrollY - last });
    last = window.scrollY;
  }, { passive: true });
});

// Simulate touch scroll with gestures (mouse wheel doesn't exist on real mobile)
async function touchSwipe(fromY, toY) {
  await page.touchscreen.tap(200, 400);
  // Use a sequence of CDP touch events
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 200, y: fromY }],
  });
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const y = fromY + ((toY - fromY) * i) / steps;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 200, y }],
    });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(800);
}

// Swipe down 4 times
for (let i = 0; i < 4; i++) {
  await touchSwipe(600, 200);
  await page.waitForTimeout(500);
}

// Now wait idle
const yBefore = await page.evaluate(() => window.scrollY);
await page.waitForTimeout(3000);
const yAfter = await page.evaluate(() => window.scrollY);

const log = await page.evaluate(() => window.__log);
const jerks = [];
for (let i = 1; i < log.length; i++) {
  if (log[i].d < -40) jerks.push({ from: log[i - 1].y, to: log[i].y, d: log[i].d });
}
console.log("=== Pixel 5 real-touch ===");
console.log("scroll events:", log.length);
console.log("upward jerks (delta < -40):", jerks.length);
if (jerks.length) console.log("sample:", JSON.stringify(jerks.slice(0, 5)));
console.log("idle y before:", yBefore, "after 3s:", yAfter, "drift:", yAfter - yBefore);
console.log("first 6:", JSON.stringify(log.slice(0, 6)));
console.log("last 6:", JSON.stringify(log.slice(-6)));
await ctx.close();
await browser.close();
