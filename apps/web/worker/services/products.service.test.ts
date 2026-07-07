import { describe, expect, it } from "vitest";
import { reconcileStock, recordStockMovement } from "./products.service";

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

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.all<T>() };
  }

  async run(): Promise<D1Result> {
    this.db.run(this.sql, this.values);
    return { success: true } as D1Result;
  }
}

class FakeD1Database {
  public movements: FakeMovementRow[] = [];

  constructor(public product: FakeProductRow) {}

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM products") && values.includes(this.product.id)) {
      return this.product as T;
    }

    if (sql.includes("FROM stock_movements")) {
      return (this.movements[0] ?? null) as T | null;
    }

    return null;
  }

  all<T>(): T[] {
    return [];
  }

  run(sql: string, values: unknown[]): void {
    if (sql.startsWith("UPDATE products")) {
      this.product = {
        ...this.product,
        current_stock_milli: values[0] as number,
        average_cost_minor: values[1] as number,
        purchase_price_minor: values[2] as number,
      };
      return;
    }

    if (sql.includes("INSERT INTO stock_movements")) {
      this.movements.unshift({
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
  }
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

describe("product inventory service", () => {
  it("records stock movement and keeps movement sum reconcilable", async () => {
    const db = new FakeD1Database(product()) as unknown as D1Database;

    const movement = await recordStockMovement(db, "org-1", "user-1", {
      productId: "product-1",
      movementType: "purchase",
      movementDate: "2026-07-07",
      quantity: 5,
      unitCost: 200,
      notes: "Pembelian",
    });

    expect(movement.quantity).toBe(5);
    expect(movement.stock_after).toBe(15);
    expect(reconcileStock(15_000, [10_000, movement.quantity * 1000])).toBe(true);
  });

  it("updates weighted average cost on purchase movements", async () => {
    const fake = new FakeD1Database(product());
    await recordStockMovement(fake as unknown as D1Database, "org-1", "user-1", {
      productId: "product-1",
      movementType: "purchase",
      movementDate: "2026-07-07",
      quantity: 10,
      unitCost: 200,
    });

    expect(fake.movements[0].stock_after_milli).toBe(20_000);
    expect(fake.product.average_cost_minor).toBe(150);

    await recordStockMovement(fake as unknown as D1Database, "org-1", "user-1", {
      productId: "product-1",
      movementType: "sale",
      movementDate: "2026-07-08",
      quantity: -4,
      unitCost: 999,
    });

    expect(fake.product.current_stock_milli).toBe(16_000);
    expect(fake.product.average_cost_minor).toBe(150);
  });

  it("rejects movements that would make stock negative", async () => {
    const db = new FakeD1Database(product()) as unknown as D1Database;

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
