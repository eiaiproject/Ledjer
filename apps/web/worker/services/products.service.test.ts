import { describe, expect, it } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import {
  createProduct,
  reconcileStock,
  recordStockAdjustment,
  recordStockMovement,
} from "./products.service";

interface FakeProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  purchase_price_minor: number;
  selling_price_minor: number;
  average_cost_minor: number;
  current_stock_milli: number;
  min_stock_milli: number;
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  revenue_account_id: string | null;
  is_active: 0 | 1;
}

interface FakeMovementRow {
  id: string;
  organization_id: string;
  product_id: string;
  movement_date: string;
  movement_type: string;
  quantity_milli: number;
  unit_cost_minor: number | null;
  transaction_id: string | null;
  stock_after_milli: number;
  notes: string | null;
  created_by: string | null;
  created_at: number;
}

interface RecordedStatement {
  sql: string;
  values: unknown[];
}

function product(overrides: Partial<FakeProductRow> = {}): FakeProductRow {
  return {
    id: "product-1",
    code: "PRD-1",
    name: "Produk",
    description: null,
    unit: "pcs",
    purchase_price_minor: 100,
    selling_price_minor: 150,
    average_cost_minor: 100,
    current_stock_milli: 10_000,
    min_stock_milli: 0,
    inventory_account_id: null,
    cogs_account_id: null,
    revenue_account_id: null,
    is_active: 1,
    ...overrides,
  };
}

function productDb(initialProduct: FakeProductRow) {
  const state = {
    product: initialProduct,
    movements: [] as FakeMovementRow[],
  };
  const db = new FakeD1Database({
    first: (sql, values) => {
      if (sql.includes("FROM products") && values.includes(state.product.id)) return state.product;
      if (sql.includes("FROM stock_movements")) return state.movements[0] ?? null;
      return null;
    },
    run: (sql, values) => {
      if (sql.startsWith("UPDATE products")) {
        state.product = {
          ...state.product,
          current_stock_milli: values[0] as number,
          average_cost_minor: values[1] as number,
          purchase_price_minor: values[2] as number,
        };
      }

      if (sql.includes("INSERT INTO stock_movements")) {
        state.movements.unshift({
          id: values[0] as string,
          organization_id: values[1] as string,
          product_id: values[2] as string,
          movement_date: values[3] as string,
          movement_type: values[4] as string,
          quantity_milli: values[5] as number,
          unit_cost_minor: values[6] as number | null,
          transaction_id: values[7] as string | null,
          stock_after_milli: values[8] as number,
          notes: values[9] as string | null,
          created_by: values[10] as string | null,
          created_at: values[11] as number,
        });
      }
    },
  });
  return { db: db as unknown as D1Database, state };
}

/**
 * DB mock for stock adjustments: knows the default chart of accounts,
 * the document counter, and records journal statements sent via batch.
 */
function adjustmentDb(initialProduct: FakeProductRow, accountIds: Record<string, string | null> = {
  "1300": "acct-1300", "7100": "acct-7100", "8100": "acct-8100",
}) {
  const state = {
    product: initialProduct,
    movements: [] as FakeMovementRow[],
    journalStatements: [] as RecordedStatement[],
    counter: 5,
    periodLocked: false,
  };
  const db = new FakeD1Database({
    first: (sql, values) => {
      if (sql.includes("FROM products") && values.includes(state.product.id)) return state.product;
      if (sql.includes("FROM stock_movements")) return state.movements[0] ?? null;
      if (sql.includes("FROM period_locks")) return state.periodLocked ? { id: "lock-1" } : null;
      if (sql.includes("FROM accounts")) {
        const code = values[1] as string;
        const id = accountIds[code];
        return id ? { id } : null;
      }
      if (sql.includes("organization_document_counters")) {
        state.counter += 1;
        return { current_value: state.counter };
      }
      return null;
    },
    run: (sql, values) => {
      if (sql.startsWith("UPDATE products")) {
        state.product = {
          ...state.product,
          current_stock_milli: values[0] as number,
          average_cost_minor: values[1] as number,
          purchase_price_minor: values[2] as number,
        };
      }
      if (sql.includes("INSERT INTO stock_movements")) {
        state.movements.unshift({
          id: values[0] as string,
          organization_id: values[1] as string,
          product_id: values[2] as string,
          movement_date: values[3] as string,
          movement_type: values[4] as string,
          quantity_milli: values[5] as number,
          unit_cost_minor: values[6] as number | null,
          transaction_id: values[7] as string | null,
          stock_after_milli: values[8] as number,
          notes: values[9] as string | null,
          created_by: values[10] as string | null,
          created_at: values[11] as number,
        });
      }
    },
    batch: async (statements) => {
      state.journalStatements.push(...statements);
      // Stock adjustments write the movement + journal in ONE atomic batch
      // (the product UPDATE goes through `run` via updateProductStockWithRetry).
      // Apply the movement side effect so the recorded state stays realistic.
      for (const s of statements) {
        if (s.sql.includes("INSERT INTO stock_movements")) {
          state.movements.unshift({
            id: s.values[0] as string,
            organization_id: s.values[1] as string,
            product_id: s.values[2] as string,
            movement_date: s.values[3] as string,
            movement_type: s.values[4] as string,
            quantity_milli: s.values[5] as number,
            unit_cost_minor: s.values[6] as number | null,
            transaction_id: s.values[7] as string | null,
            stock_after_milli: s.values[8] as number,
            notes: s.values[9] as string | null,
            created_by: s.values[10] as string | null,
            created_at: s.values[11] as number,
          });
        }
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }) as D1Result);
    },
  });
  return { db: db as unknown as D1Database, state };
}

describe("product inventory service", () => {
  it("records stock movement and keeps movement sum reconcilable", async () => {
    const { db } = productDb(product());

    const movement = await recordStockMovement(db, "org-1", "user-1", {
      productId: "product-1",
      movementType: "purchase",
      movementDate: "2026-07-07",
      quantity: 5,
      unitCost: 200,
      notes: "Pembelian",
    });

    expect(movement.quantity).toBe("5");
    expect(movement.stock_after).toBe("15");
    expect(reconcileStock(15_000, [10_000, Number(movement.quantity) * 1000])).toBe(true);
  });

  it("updates weighted average cost on purchase movements", async () => {
    const fake = productDb(product());
    await recordStockMovement(fake.db, "org-1", "user-1", {
      productId: "product-1",
      movementType: "purchase",
      movementDate: "2026-07-07",
      quantity: 10,
      unitCost: 200,
    });

    expect(fake.state.movements[0].stock_after_milli).toBe(20_000);
    expect(fake.state.product.average_cost_minor).toBe(150);

    await recordStockMovement(fake.db, "org-1", "user-1", {
      productId: "product-1",
      movementType: "sale",
      movementDate: "2026-07-08",
      quantity: -4,
      unitCost: 999,
    });

    expect(fake.state.product.current_stock_milli).toBe(16_000);
    expect(fake.state.product.average_cost_minor).toBe(150);
  });

  it("renders whole quantities as integers and true fractions with decimals", async () => {
    const fake = productDb(product());

    const whole = await recordStockMovement(fake.db, "org-1", "user-1", {
      productId: "product-1",
      movementType: "purchase",
      movementDate: "2026-07-07",
      quantity: 5,
    });
    expect(whole.quantity).toBe("5");
    expect(whole.stock_after).toBe("15");

    const fractional = await recordStockMovement(fake.db, "org-1", "user-1", {
      productId: "product-1",
      movementType: "purchase",
      movementDate: "2026-07-07",
      quantity: 0.5,
    });
    expect(fractional.quantity).toBe("0.5");
    expect(fractional.stock_after).toBe("15.5");

    const negative = await recordStockMovement(fake.db, "org-1", "user-1", {
      productId: "product-1",
      movementType: "sale",
      movementDate: "2026-07-07",
      quantity: -3.25,
    });
    expect(negative.quantity).toBe("-3.25");
    expect(negative.stock_after).toBe("12.25");
  });

  it("rejects movements that would make stock negative", async () => {
    const { db } = productDb(product());

    await expect(
      recordStockMovement(db, "org-1", "user-1", {
        productId: "product-1",
        movementType: "sale",
        movementDate: "2026-07-07",
        quantity: -11,
      }),
    ).rejects.toMatchObject({
      code: "insufficient_stock",
      status: 409,
    });
  });
});

describe("opening stock journal posting", () => {
  function createProductDb(initialProduct: FakeProductRow = product({
    current_stock_milli: 0,
    average_cost_minor: 1000,
    inventory_account_id: "acct-1300",
  })) {
    const state = {
      product: initialProduct,
      movements: [] as FakeMovementRow[],
      journalStatements: [] as RecordedStatement[],
      counter: 0,
    };
    const db = new FakeD1Database({
      first: (sql, values) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("SELECT onboarding_status FROM organizations")) return { onboarding_status: "in_progress" };
        if (s.includes("FROM products") && s.includes("lower(code)")) return null; // uniqueness check
        if (s.includes("FROM products")) return state.product;
        if (s.includes("FROM stock_movements")) return state.movements[0] ?? null;
        if (s.includes("FROM accounts")) {
          const ids: Record<string, string> = {
            "1300": "acct-1300", "5100": "acct-5100", "4100": "acct-4100", "3200": "acct-3200",
          };
          const id = ids[values[1] as string];
          return id ? { id } : null;
        }
        if (s.includes("organization_document_counters")) {
          state.counter += 1;
          return { current_value: state.counter };
        }
        return null;
      },
      run: (sql, values) => {
        if (sql.startsWith("UPDATE products")) {
          state.product = {
            ...state.product,
            current_stock_milli: values[0] as number,
            average_cost_minor: values[1] as number,
            purchase_price_minor: values[2] as number,
          };
        }
        if (sql.includes("INSERT INTO stock_movements")) {
          state.movements.unshift({
            id: values[0] as string,
            organization_id: values[1] as string,
            product_id: values[2] as string,
            movement_date: values[3] as string,
            movement_type: values[4] as string,
            quantity_milli: values[5] as number,
            unit_cost_minor: values[6] as number | null,
            transaction_id: values[7] as string | null,
            stock_after_milli: values[8] as number,
            notes: values[9] as string | null,
            created_by: values[10] as string | null,
            created_at: values[11] as number,
          });
        }
      },
      batch: async (statements) => {
        state.journalStatements.push(...statements);
        return statements.map(() => ({ success: true, meta: { changes: 1 } }) as D1Result);
      },
    });
    return { db: db as unknown as D1Database, state };
  }

  it("posts Dr Persediaan / Cr Saldo Awal when a product is created with initial stock", async () => {
    const fake = createProductDb();

    const created = await createProduct(fake.db, "org-1", "user-1", {
      code: "PRD-NEW",
      name: "Telur",
      unit: "pcs",
      purchasePrice: 1000,
      sellingPrice: 1500,
      currentStock: 3,
      minStock: 1,
    });

    expect(created.current_stock).toBe("3");

    const entries = fake.state.journalStatements.filter((s) => s.sql.includes("INSERT INTO journal_"));
    expect(entries).toHaveLength(3); // 1 journal_entries + 2 journal_lines

    const entry = entries.find((s) => s.sql.includes("INSERT INTO journal_entries"));
    expect(entry).toBeDefined();
    expect(String(entry!.values[2])).toBe("OP-000001"); // entry_number

    const lines = entries.filter((s) => s.sql.includes("INSERT INTO journal_lines"));
    const debitLine = lines.find((l) => Number(l.values[4]) > 0);
    const creditLine = lines.find((l) => Number(l.values[5]) > 0);
    expect(debitLine!.values[3]).toBe("acct-1300"); // Persediaan
    expect(Number(debitLine!.values[4])).toBe(3000);
    expect(creditLine!.values[3]).toBe("acct-3200"); // Saldo Awal
    expect(Number(creditLine!.values[5])).toBe(3000);
  });
});

describe("stock adjustment journal posting", () => {
  function journalInserts(state: { journalStatements: RecordedStatement[] }) {
    return state.journalStatements.filter((s) => s.sql.includes("INSERT INTO journal_"));
  }

  it("posts a balanced journal when stock is decreased (Dr Beban Lain-lain / Cr Persediaan)", async () => {
    const fake = adjustmentDb(product({
      average_cost_minor: 1000,
      current_stock_milli: 3000,
      inventory_account_id: "acct-1300",
    }));

    const movement = await recordStockAdjustment(fake.db, "org-1", "user-1", {
      productId: "product-1",
      quantity: -3,
      reason: "Stok rusak",
      movementDate: "2026-07-07",
    });

    expect(movement.quantity).toBe("-3");
    expect(movement.journal_posted).toBe(true);
    expect(fake.state.product.current_stock_milli).toBe(0);

    const entries = journalInserts(fake.state);
    expect(entries).toHaveLength(3); // 1 journal_entries + 2 journal_lines

    const entry = entries.find((s) => s.sql.includes("INSERT INTO journal_entries"));
    expect(entry).toBeDefined();
    expect(String(entry!.values[2])).toBe("AJ-000006"); // entry_number from counter
    expect(entry!.values[3]).toBe("2026-07-07"); // entry_date

    const lines = entries.filter((s) => s.sql.includes("INSERT INTO journal_lines"));
    const debitLine = lines.find((l) => Number(l.values[4]) > 0);
    const creditLine = lines.find((l) => Number(l.values[5]) > 0);
    expect(debitLine!.values[3]).toBe("acct-8100"); // Beban Lain-lain
    expect(Number(debitLine!.values[4])).toBe(3000);
    expect(creditLine!.values[3]).toBe("acct-1300"); // Persediaan
    expect(Number(creditLine!.values[5])).toBe(3000);
  });

  it("posts a balanced journal when stock is increased (Dr Persediaan / Cr Pendapatan Lain-lain)", async () => {
    const fake = adjustmentDb(product({
      average_cost_minor: 500,
      current_stock_milli: 0,
      inventory_account_id: "acct-1300",
    }));

    await recordStockAdjustment(fake.db, "org-1", "user-1", {
      productId: "product-1",
      quantity: 2,
      reason: "Stok ditemukan saat opname",
      movementDate: "2026-07-07",
    });

    const lines = journalInserts(fake.state).filter((s) => s.sql.includes("INSERT INTO journal_lines"));
    const debitLine = lines.find((l) => Number(l.values[4]) > 0);
    const creditLine = lines.find((l) => Number(l.values[5]) > 0);
    expect(debitLine!.values[3]).toBe("acct-1300"); // Persediaan
    expect(Number(debitLine!.values[4])).toBe(1000);
    expect(creditLine!.values[3]).toBe("acct-7100"); // Pendapatan Lain-lain
    expect(Number(creditLine!.values[5])).toBe(1000);
  });

  it("still records the movement but skips the journal when accounts are not configured", async () => {
    const fake = adjustmentDb(product({
      average_cost_minor: 1000,
      current_stock_milli: 3000,
      inventory_account_id: null,
    }), { "1300": null, "7100": null, "8100": null });

    const movement = await recordStockAdjustment(fake.db, "org-1", "user-1", {
      productId: "product-1",
      quantity: -3,
      reason: "Hilang",
      movementDate: "2026-07-07",
    });

    expect(movement.quantity).toBe("-3");
    expect(movement.journal_posted).toBe(false);
    expect(journalInserts(fake.state)).toHaveLength(0);
  });

  it("rejects adjustments inside a locked period", async () => {
    const fake = adjustmentDb(product({
      average_cost_minor: 1000,
      current_stock_milli: 3000,
      inventory_account_id: "acct-1300",
    }));
    fake.state.periodLocked = true;

    await expect(
      recordStockAdjustment(fake.db, "org-1", "user-1", {
        productId: "product-1",
        quantity: -3,
        reason: "Stok rusak",
        movementDate: "2026-07-07",
      }),
    ).rejects.toMatchObject({ code: "period_locked" });

    expect(fake.state.movements).toHaveLength(0);
    expect(journalInserts(fake.state)).toHaveLength(0);
  });

  it("writes the movement and its journal in a single atomic batch", async () => {
    const fake = adjustmentDb(product({
      average_cost_minor: 1000,
      current_stock_milli: 3000,
      inventory_account_id: "acct-1300",
    }));

    await recordStockAdjustment(fake.db, "org-1", "user-1", {
      productId: "product-1",
      quantity: -3,
      reason: "Stok rusak",
      movementDate: "2026-07-07",
    });

    // ONE batch carries the movement AND its journal - atomic, so a failure
    // can never leave a movement without its paired journal.
    const batchStatements = fake.state.journalStatements;
    expect(batchStatements.some((s) => s.sql.includes("INSERT INTO stock_movements"))).toBe(true);
    expect(batchStatements.some((s) => s.sql.includes("INSERT INTO journal_entries"))).toBe(true);
    expect(journalInserts(fake.state)).toHaveLength(3); // 1 journal_entries + 2 journal_lines
    expect(fake.state.product.current_stock_milli).toBe(0);
    expect(fake.state.movements[0].stock_after_milli).toBe(0);
    expect(fake.state.movements[0].movement_type).toBe("adjustment");
  });
});
