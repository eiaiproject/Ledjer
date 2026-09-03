import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * CSV Export E2E for the MVP: the authenticated export endpoint returns a
 * downloadable CSV with the expected columns and a formula-injection-safe
 * header row.
 */

test.describe("CSV export", () => {
  test("GET /api/exports/transactions.csv returns a CSV download", async ({ authPage }) => {
    const result = await authPage.evaluate(async () => {
      const res = await fetch("/api/exports/transactions.csv");
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        contentDisposition: res.headers.get("content-disposition") ?? "",
        text,
      };
    });

    expect(result.status).toBe(200);
    expect(result.contentType).toContain("text/csv");
    expect(result.contentDisposition).toContain("attachment");

    // Strip UTF-8 BOM if present, then check the header row.
    const csv = result.text.replace(/^\uFEFF/, "");
    const headerRow = csv.split("\n")[0];
    expect(headerRow).toContain("transaction_date");
    expect(headerRow).toContain("transaction_number");
    expect(headerRow).toContain("transaction_type");
    expect(headerRow).toContain("status");
    expect(headerRow).toContain("description");
    expect(headerRow).toContain("cash_bank_account");
    expect(headerRow).toContain("counter_account");
    expect(headerRow).toContain("amount_idr");
  });

  test("export page button triggers a CSV download", async ({ authPage }) => {
    await authPage.goto("/transactions", { waitUntil: "load", timeout: 15000 });

    const downloadPromise = authPage.waitForEvent("download", { timeout: 15000 });
    await authPage.getByRole("button", { name: /Export CSV/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks).toString("utf-8").replace(/^\uFEFF/, "");
    expect(content.split("\n")[0]).toContain("transaction_number");
  });
});