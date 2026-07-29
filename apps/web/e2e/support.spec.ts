/**
 * E2E tests for support features (Trakteer, free-access copy, banner).
 *
 * Coverage from master.md Fase 14:
 * - Landing menampilkan "Saat ini gratis digunakan"
 * - Landing menampilkan "Tanpa kartu kredit"
 * - Primary CTA menuju register
 * - CTA Trakteer menggunakan URL resmi
 * - CTA Trakteer membuka tab baru
 * - Dukungan disebut sukarela
 * - Dukungan tidak memengaruhi akses
 * - Tidak ada billing form
 * - Tidak ada checkout
 * - Tidak ada paywall
 * - Footer support link benar
 * - Support link attributes (target="_blank", rel="noopener noreferrer")
 */

import { test, expect } from "@playwright/test";
import { test as authTest } from "./helpers/auth";

const SUPPORT_URL = "https://trakteer.id/eiaiproject/tip";

// ── Public Pages ────────────────────────────────────────────────

test.describe("Landing page — support & free access copy", () => {
  test('menampilkan "Saat ini gratis digunakan" pada hero', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText("Saat ini gratis digunakan");
  });

  test('menampilkan "Tanpa kartu kredit"', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText("Tanpa kartu kredit");
  });

  test('primary CTA "Mulai Gratis" menuju halaman register', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const mulaiGratis = page.getByRole("link", { name: /mulai gratis/i }).first();
    await expect(mulaiGratis).toBeVisible();
    await expect(mulaiGratis).toHaveAttribute("href", "/register");
  });

  test('dukungan disebut "sepenuhnya sukarela"', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText("sepenuhnya sukarela");
  });

  test('dukungan "tidak memengaruhi akses"', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText("tidak memengaruhi akses");
  });

  test("Tidak ada billing form atau checkout di halaman publik", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Periksa tidak ada form/elemen yang terkait pembayaran
    // Gunakan selector spesifik untuk menghindari false positive pada FAQ copy
    const billingElements = page.locator(
      'input[type="card"], ' +
        'form input[name*="card"], ' +
        'form input[name*="cvv"], ' +
        'form input[name*="expiry"], ' +
        'form input[placeholder*="4242"], ' +
        '[data-testid*="checkout"], ' +
        '[data-testid*="subscription"], ' +
        'a[href*="/subscribe"], ' +
        'a[href*="/upgrade"], ' +
        'a[href*="/pricing"], ' +
        'button:has-text("Pilih paket"), ' +
        'button:has-text("Bayar sekarang")',
    );
    await expect(billingElements).toHaveCount(0);
  });

  test("Tidak ada paywall atau paket berbayar", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Halaman boleh mengandung "berlangganan" dalam konteks "tanpa berlangganan"
    // Hanya periksa elemen yang secara eksplisit menawarkan paket berbayar
    const paywallElements = page.locator(
      'a[href*="/pricing"], ' +
        'a[href*="/plans"], ' +
        '[aria-label*="upgrade"], ' +
        'button:has-text("Pilih paket"), ' +
        'button:has-text("Upgrade"), ' +
        'section:has(h2):has-text("Paket"), ' +
        '[data-testid*="pricing-table"]',
    );
    await expect(paywallElements).toHaveCount(0);
  });
});

test.describe("Landing page — Trakteer CTA", () => {
  test("CTA Trakteer pada section akses menggunakan URL resmi", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const supportLink = page.locator(`a[href="${SUPPORT_URL}"]`).first();
    await expect(supportLink).toBeVisible();
  });

  test("CTA Trakteer membuka tab baru (target=_blank)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const supportLink = page.locator(`a[href="${SUPPORT_URL}"]`).first();
    await expect(supportLink).toHaveAttribute("target", "_blank");
  });

  test("CTA Trakteer memiliki rel=noopener noreferrer untuk keamanan", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const supportLink = page.locator(`a[href="${SUPPORT_URL}"]`).first();
    await expect(supportLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});

test.describe("Footer — support link", () => {
  test("Footer memiliki link dukungan yang benar", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const footerSupportLink = page
      .locator("footer")
      .locator(`a[href="${SUPPORT_URL}"]`);
    await expect(footerSupportLink).toBeVisible();
    await expect(footerSupportLink).toHaveAttribute("target", "_blank");
    await expect(footerSupportLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});

test.describe("Register page — free access copy", () => {
  test('menampilkan "Gratis digunakan saat ini"', async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText("Gratis digunakan saat ini");
  });

  test('menampilkan "Tanpa kartu kredit"', async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText("Tanpa kartu kredit");
  });

  test("CTA tombol 'Buat akun gratis' ada", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    const cta = page.getByRole("button", { name: /buat akun gratis/i });
    await expect(cta).toBeVisible();
  });
});

test.describe("404 page", () => {
  test("404 tetap menampilkan halaman tidak ditemukan (bukan redirect)", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /tidak ditemukan|not found/i }),
    ).toBeVisible();
  });
});

// ── Authenticated Pages (requires valid E2E credentials) ────────

authTest.describe("Support banner — authenticated pages", () => {
  // Reset localStorage cooldown before each banner test agar banner selalu muncul
  authTest.beforeEach(async ({ authPage }) => {
    await authPage.evaluate(() => {
      localStorage.removeItem("ledjer:support_banner_dismissed_at");
    });
  });

  authTest("SupportBanner muncul pada halaman dashboard", async ({ authPage }) => {
    await authPage.goto("/dashboard");
    await authPage.waitForLoadState("networkidle");

    const banner = authPage.locator('[role="status"]').filter({ hasText: "Ledjer membantu pekerjaan Anda?" });
    await expect(banner).toBeVisible({ timeout: 15_000 });
  });

  authTest("SupportBanner memiliki link dengan URL Trakteer", async ({ authPage }) => {
    await authPage.goto("/dashboard");
    await authPage.waitForLoadState("networkidle");

    const bannerLink = authPage.locator('[role="status"] a').filter({ hasText: /Dukung Ledjer/i });
    await expect(bannerLink).toHaveAttribute("href", SUPPORT_URL);
    await expect(bannerLink).toHaveAttribute("target", "_blank");
  });

  authTest("SupportBanner dapat ditutup dengan tombol dismiss", async ({ authPage }) => {
    await authPage.goto("/dashboard");
    await authPage.waitForLoadState("networkidle");

    const banner = authPage.locator('[role="status"]').filter({ hasText: "Ledjer membantu pekerjaan Anda?" });
    await expect(banner).toBeVisible({ timeout: 15_000 });

    const dismissBtn = authPage.getByRole("button", { name: /Tutup pemberitahuan dukungan/i });
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  });

  authTest("SupportBanner tidak muncul pada halaman transaksi baru", async ({ authPage }) => {
    await authPage.goto("/transactions/new");
    await authPage.waitForLoadState("networkidle");

    // Pastikan halaman termuat dengan benar (sanity check)
    await expect(authPage.locator("body")).toContainText(/transaksi|jurnal|catat/i, { timeout: 15_000 });

    const banner = authPage.locator('[role="status"]').filter({ hasText: "Ledjer membantu pekerjaan Anda?" });
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
  });
});

authTest.describe("Sidebar support link — app menu", () => {
  authTest("Sidebar memiliki link 'Traktir pengembang' dengan URL resmi", async ({ authPage }) => {
    await authPage.goto("/dashboard");
    await authPage.waitForLoadState("networkidle");

    const sidebar = authPage.locator("aside");
    const supportLink = sidebar.locator(`a[href="${SUPPORT_URL}"]`);
    await expect(supportLink).toBeVisible({ timeout: 15_000 });
    await expect(supportLink).toHaveAttribute("target", "_blank");
    await expect(supportLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(supportLink).toContainText("Traktir pengembang");
  });
});
