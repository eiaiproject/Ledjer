import { describe, expect, it } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import { computeInventoryMismatch, currentMonthPeriod, getDashboardAlerts, getDashboardSummary } from "./dashboard.service";

describe("dashboard summary", () => {
  it("uses the current local month as the dashboard period", () => {
    // Use noon UTC to avoid date boundary issues across timezones
    expect(currentMonthPeriod(new Date("2026-07-17T12:00:00.000Z"))).toEqual({
      periodFrom: "2026-07-01",
      periodTo: "2026-07-17",
    });
  });

  it("maps aggregate rows and derives net profit", async () => {
    let sql = "";
    let values: unknown[] = [];
    const row = {
      cash_balance: 1_250_000,
      revenue_current_period: 2_000_000,
      expense_current_period: 750_000,
      accounts_receivable: 300_000,
      accounts_payable: 125_000,
    };
    const fake = new FakeD1Database({
      first: (query, boundValues) => {
        sql = query;
        values = boundValues;
        return row;
      },
    });

    const summary = await getDashboardSummary(
      fake as unknown as D1Database,
      "org-1",
      new Date("2026-07-17T10:00:00.000Z"),
    );

    expect(summary).toEqual({
      cash_balance: 1_250_000,
      revenue_current_period: 2_000_000,
      expense_current_period: 750_000,
      net_profit_current_period: 1_250_000,
      accounts_receivable: 300_000,
      accounts_payable: 125_000,
      period_from: "2026-07-01",
      period_to: "2026-07-17",
    });
    expect(values).toEqual([
      "org-1",
      "2026-07-17",
      "org-1",
      "2026-07-01",
      "2026-07-17",
      "org-1",
    ]);
    expect(sql).toContain("posted_balances AS");
    expect(sql).toContain("period_balances AS");
    expect(sql).toContain("je.entry_type != 'opening_balance'");
  });
});

describe("dashboard alerts", () => {
  it("flags an inventory mismatch when the control account diverges from the stock subledger", async () => {
    const fake = new FakeD1Database({
      first: (sql) => {
        if (sql.includes("inv_balance")) {
          return { account_balance: 21693, stock_value: 0 };
        }
        return null;
      },
    });

    const { alerts } = await getDashboardAlerts(fake as unknown as D1Database, "org-1");

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "inventory_mismatch",
      type: "inventory_mismatch",
      severity: "medium",
      actionLabel: "Periksa Stok",
      actionPath: "/products",
    });
    expect(alerts[0].description).toContain("21.693");
  });

  it("does not alert when the stock subledger matches the control account", async () => {
    const fake = new FakeD1Database({
      first: (sql) => {
        if (sql.includes("inv_balance")) {
          return { account_balance: 0, stock_value: 0 };
        }
        return null;
      },
    });

    const { alerts } = await getDashboardAlerts(fake as unknown as D1Database, "org-1");
    expect(alerts).toHaveLength(0);
  });
});

/**
 * Fase 3 golden tests: reproduce the real production corruption from org
 * b28dc5e4-… (Persediaan Sederhana overstated by Rp 56.250 due to a void
 * double-reversal race) and verify the mismatch detector + on-demand
 * reconciliation behave correctly across the corruption → correction arc.
 *
 * The FakeD1 handler below emulates a single product (Telur, 10 pcs @ 1.890 =
 * 18.900) and a Persediaan control account whose posted balance is 75.150
 * (overstated by 56.250) when corrupted, then 18.900 after the correction
 * journal is applied.
 */
describe("inventory mismatch — Fase 3 golden (org b28dc5e4 corruption arc)", () => {
  // Mirror of the real prod figures (minor units).
  const STOCK_VALUE = 18_900; // 10 pcs Telur @ 1.890
  const CORRUPTED_BOOK = 75_150; // overstated by 56.250 (the alert amount)
  const CORRECTED_BOOK = 18_900; // after adjustment journal: Cr 1300 56.250

  // Emulates computeInventoryMismatch's single CTE query. All OTHER dashboard
  // alert checkers get `null`, so getDashboardAlerts only ever emits the
  // inventory_mismatch alert (no low_stock / draft / etc. noise).
  function makeFake(bookBalance: number) {
    return new FakeD1Database({
      first: (sql) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("inv_balance")) {
          return { account_balance: bookBalance, stock_value: STOCK_VALUE };
        }
        return null;
      },
    });
  }

  // Emulates verifyInventoryMatch's three separate queries (backup.service).
  function makeBackupFake(bookBalance: number) {
    return new FakeD1Database({
      first: (sql) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("FROM products") && s.includes("COUNT")) {
          return { count: 1 };
        }
        if (s.includes("stock_value")) {
          return { stock_value: STOCK_VALUE };
        }
        if (s.includes("FROM journal_lines") && s.includes("account_id IN")) {
          return { balance: bookBalance };
        }
        return null;
      },
    });
  }

  it("reconciliation reports the exact production divergence (75.150 vs 18.900 → 56.250)", async () => {
    const recon = await computeInventoryMismatch(makeFake(CORRUPTED_BOOK) as unknown as D1Database, "org-b28");
    expect(recon.accountBalance).toBe(CORRUPTED_BOOK);
    expect(recon.stockValue).toBe(STOCK_VALUE);
    expect(recon.diff).toBe(56_250);
    expect(recon.matched).toBe(false);
  });

  it("dashboard alert fires with the real selisih when corrupted", async () => {
    const { alerts } = await getDashboardAlerts(makeFake(CORRUPTED_BOOK) as unknown as D1Database, "org-b28");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe("inventory_mismatch");
    expect(alerts[0].description).toContain("75.150");
    expect(alerts[0].description).toContain("18.900");
    expect(alerts[0].description).toContain("56.250");
  });

  it("reconciliation matches after the correction journal is applied", async () => {
    const recon = await computeInventoryMismatch(makeFake(CORRECTED_BOOK) as unknown as D1Database, "org-b28");
    expect(recon.accountBalance).toBe(CORRECTED_BOOK);
    expect(recon.stockValue).toBe(STOCK_VALUE);
    expect(recon.diff).toBe(0);
    expect(recon.matched).toBe(true);
  });

  it("dashboard alert is cleared after correction", async () => {
    const { alerts } = await getDashboardAlerts(makeFake(CORRECTED_BOOK) as unknown as D1Database, "org-b28");
    expect(alerts).toHaveLength(0);
  });

  it("tolerates small WAC rounding drift (< Rp 1.000) and does not alert", async () => {
    // Book off by Rp 999 — within tolerance, must not alert.
    const { alerts } = await getDashboardAlerts(makeFake(STOCK_VALUE + 999) as unknown as D1Database, "org-b28");
    expect(alerts).toHaveLength(0);
  });

  it("flags a Rp 1.000 drift as a real mismatch (boundary)", async () => {
    const recon = await computeInventoryMismatch(makeFake(STOCK_VALUE + 1000) as unknown as D1Database, "org-b28");
    expect(recon.diff).toBe(1000);
    expect(recon.matched).toBe(false);
    const { alerts } = await getDashboardAlerts(makeFake(STOCK_VALUE + 1000) as unknown as D1Database, "org-b28");
    expect(alerts).toHaveLength(1);
  });

  it("backup verifyInventoryMatch agrees with the dashboard detector", async () => {
    const { verifyInventoryMatch } = await import("./backup.service");
    const corrupted = await verifyInventoryMatch(makeBackupFake(CORRUPTED_BOOK) as unknown as D1Database);
    expect(corrupted.matched).toBe(false);
    expect(corrupted.diff).toBe(56_250);
    const corrected = await verifyInventoryMatch(makeBackupFake(CORRECTED_BOOK) as unknown as D1Database);
    expect(corrected.matched).toBe(true);
    expect(corrected.diff).toBe(0);
  });
});
