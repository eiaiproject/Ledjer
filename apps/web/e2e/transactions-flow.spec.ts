import { test, expect } from "@playwright/test";
import { uniqueUser } from "./fixtures/users";
import { registerUser, loginViaAPI } from "./fixtures/auth";
import { getCashAccount } from "./fixtures/accounts";
import { createE2EProduct } from "./fixtures/products";
import { seedTransaction } from "./fixtures/transactions";

/**
 * Authenticated E2E test — full transaction lifecycle.
 * Uses D1-native seed helpers (Worker API) instead of Supabase.
 *
 * Flow: register → login → create org → create account → post transaction → void → check reports
 */

test.describe("Authenticated Transaction Lifecycle", () => {
  let sessionToken: string;

  test.beforeAll(async ({ request }) => {
    // Register and login a unique user for this test suite
    const user = uniqueUser("txflow");
    await registerUser(user);
    sessionToken = await loginViaAPI(user);

    // Create an organization for the authenticated user
    const baseUrl = process.env.E2E_BASE_URL || "http://localhost:4173";
    const orgRes = await request.post(`${baseUrl}/api/organizations`, {
      headers: { Cookie: `ledjer_session=${sessionToken}` },
      data: {
        organizationName: `[E2E] Transaction Flow Org`,
        businessType: "service",
        booksStartDate: "2026-01-01",
      },
    });
    expect(orgRes.ok()).toBeTruthy();
  });

  test("can access dashboard after org creation", async ({ page }) => {
    // Set session cookie for auth
    await page.context().addCookies([
      {
        name: "ledjer_session",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Dashboard should load (may show zero balances for new org)
    await expect(page.locator("body")).toBeVisible();
  });

  test("can create a product", async () => {
    const product = await createE2EProduct(sessionToken, {
      code: `TXF-${Date.now()}`,
      name: "[E2E] Transaction Flow Product",
      purchasePrice: 10000,
      sellingPrice: 15000,
    });

    expect(product.id).toBeTruthy();
    expect(product.code).toBeTruthy();
  });

  test("can post a cash sale transaction", async () => {
    const cashAccount = await getCashAccount(sessionToken);
    const product = await createE2EProduct(sessionToken, {
      code: `TXS-${Date.now()}`,
      name: "[E2E] Sale Product",
      purchasePrice: 10000,
      sellingPrice: 15000,
    });

    const txnId = await seedTransaction(sessionToken, {
      transactionType: "cash_sale",
      amount: 150000,
      description: "[E2E] Cash sale test",
      cashAccountId: cashAccount.id,
      productId: product.id,
      quantity: 10,
      unitPrice: 15000,
    });

    expect(txnId).toBeTruthy();
  });

  test("can post an owner capital transaction", async () => {
    const cashAccount = await getCashAccount(sessionToken);

    const txnId = await seedTransaction(sessionToken, {
      transactionType: "owner_capital",
      amount: 10000000,
      description: "[E2E] Modal awal",
      cashAccountId: cashAccount.id,
    });

    expect(txnId).toBeTruthy();
  });

  test("idempotency: duplicate idempotency key returns same transaction", async () => {
    const cashAccount = await getCashAccount(sessionToken);
    const idempotencyKey = `idem-${Date.now()}`;

    const txn1 = await seedTransaction(sessionToken, {
      transactionType: "cash_sale",
      amount: 50000,
      description: "[E2E] Idempotent sale",
      cashAccountId: cashAccount.id,
      idempotencyKey,
    });

    const txn2 = await seedTransaction(sessionToken, {
      transactionType: "cash_sale",
      amount: 50000,
      description: "[E2E] Idempotent sale",
      cashAccountId: cashAccount.id,
      idempotencyKey,
    });

    expect(txn1).toBe(txn2);
  });
});
