import { describe, expect, it } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { FakeD1Statement } from "../test/fake-d1";
import type { D1Database } from "@cloudflare/workers-types";
import { HttpError } from "../http/errors";
import {
  createProduct,
  getProduct,
  listProducts,
  patchProduct,
  productIsUsed,
  recalculateProductCosts,
  resolveCogsAccount,
  resolveInventoryAccount,
} from "./products.service";
import {
  getTransaction,
  listTransactions,
  postTransaction,
  voidTransaction,
} from "./transactions.service";
import { getBalanceSheet, getProfitLoss } from "./reports.service";

const ORG_A = FIXTURE_IDS.orgs.a;
const ORG_B = FIXTURE_IDS.orgs.b;
const OWNER_A = FIXTURE_IDS.users.ownerA;
const OWNER_B = FIXTURE_IDS.users.ownerB;

function fresh(): ReturnType<typeof createSeedFixtures> {
  return createSeedFixtures();
}

function db(f = fresh()): D1Database {
  return f.db as unknown as D1Database;
}

async function expectHttpCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    expect.unreachable(`expected HttpError with code ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).code).toBe(code);
  }
}

async function purchaseKopi(
  d: D1Database,
  qty: number,
  unitCostIdr: number,
  key: string,
  date = "2026-06-15",
): Promise<void> {
  await postTransaction(d, ORG_A, OWNER_A, {
    transactionType: "purchase",
    transactionDate: date,
    cashAccountId: FIXTURE_IDS.accounts.cashA,
    description: "Beli kopi",
    idempotencyKey: key,
    items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: qty, unitCostIdr }],
  });
}

describe("resolveInventoryAccount / resolveCogsAccount", () => {
  it("resolves the Persediaan & HPP accounts of the organization", async () => {
    const d = db();
    const inventory = await resolveInventoryAccount(d, ORG_A);
    const cogs = await resolveCogsAccount(d, ORG_A);
    expect(inventory?.id).toBe(FIXTURE_IDS.accounts.inventoryA);
    expect(inventory?.account_kind).toBe("inventory");
    expect(cogs?.id).toBe(FIXTURE_IDS.accounts.cogsA);
    expect(cogs?.account_kind).toBe("cogs");
  });
});

describe("purchase (pembelian barang)", () => {
  it("posts a purchase with Persediaan DR / Kas CR journal and increases stock", async () => {
    const f = fresh();
    const d = db(f);

    const result = await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "purchase",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      description: "Beli 10 bungkus kopi",
      idempotencyKey: "idem-inv-buy-0001",
      items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: 10, unitCostIdr: 30000 }],
    });

    expect(result.status).toBe("posted");
    expect(result.transaction_number).toMatch(/^TRX-/);

    const journalLineInserts = f.db.statements.filter((s) =>
      s.sql.includes("INSERT INTO journal_lines"),
    );
    expect(journalLineInserts).toHaveLength(2);
    expect(journalLineInserts[0].values[3]).toBe(FIXTURE_IDS.accounts.inventoryA);
    expect(journalLineInserts[0].values[4]).toBe(300000);
    expect(journalLineInserts[1].values[3]).toBe(FIXTURE_IDS.accounts.cashA);
    expect(journalLineInserts[1].values[5]).toBe(300000);

    const movementInserts = f.db.statements.filter((s) =>
      s.sql.includes("INSERT INTO stock_movements"),
    );
    expect(movementInserts).toHaveLength(1);
    expect(movementInserts[0].values[4]).toBe(10000); // 10 × 1000 milli
    expect(movementInserts[0].values[5]).toBe(30000 * 10000); // harga beli → minor
    expect(movementInserts[0].values[6]).toBe(300000);

    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(product?.current_stock_milli).toBe(10000);
    expect(product?.average_cost_minor).toBe(30000 * 10000);

    // Laporan: Persediaan (aset) naik; laba rugi tidak bertambah beban
    // (hanya beban sewa seed 1.200.000 yang sudah ada).
    const bs = await getBalanceSheet(d, ORG_A, "2026-12-31");
    const persediaan = bs.assets.find((a) => a.code === "1130");
    expect(persediaan?.amount).toBe(300000);
    const pl = await getProfitLoss(d, ORG_A, "2026-01-01", "2026-12-31");
    expect(pl.expense.total).toBe(1200000);
  });

  it("computes weighted average cost across purchases", async () => {
    const d = db();
    await purchaseKopi(d, 3, 10000, "idem-inv-buy-0002");
    await purchaseKopi(d, 2, 20000, "idem-inv-buy-0003");

    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(product?.current_stock_milli).toBe(5000);
    // (3×10000 + 2×20000) / 5 = 14000 → minor.
    expect(product?.average_cost_minor).toBe(14000 * 10000);
  });

  it("supports fractional quantities (milli stock) and rounded totals", async () => {
    const d = db();
    await purchaseKopi(d, 0.5, 25000, "idem-inv-buy-0004");

    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(product?.current_stock_milli).toBe(500);
    expect(product?.average_cost_minor).toBe(25000 * 10000);
  });

  it("rejects a purchase with an inactive product", async () => {
    const d = db();
    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.gulaA);
    await patchProduct(d, ORG_A, OWNER_A, product!.id, { isActive: false });
    await expectHttpCode(
      postTransaction(d, ORG_A, OWNER_A, {
        transactionType: "purchase",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        description: "Beli gula",
        idempotencyKey: "idem-inv-buy-0005",
        items: [{ productId: FIXTURE_IDS.products.gulaA, quantity: 1, unitCostIdr: 15000 }],
      }),
      "product_inactive",
    );
  });

  it("rejects purchases without items", async () => {
    await expectHttpCode(
      postTransaction(db(), ORG_A, OWNER_A, {
        transactionType: "purchase",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        description: "Beli tanpa item",
        idempotencyKey: "idem-inv-buy-0006",
      }),
      "items_required",
    );
  });
});

describe("goods sale (penjualan barang via cash_in + items)", () => {
  it("posts revenue + COGS journals, decreases stock, and reports HPP", async () => {
    const f = fresh();
    const d = db(f);
    await purchaseKopi(d, 10, 30000, "idem-inv-sale-0001");

    await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "cash_in",
      transactionDate: "2026-06-20",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.revenueA,
      description: "Jual 4 bungkus kopi",
      idempotencyKey: "idem-inv-sale-0002",
      items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: 4, unitPriceIdr: 50000 }],
    });

    const journalLineInserts = f.db.statements.filter((s) =>
      s.sql.includes("INSERT INTO journal_lines"),
    );
    // 2 garis pembelian + 4 garis penjualan.
    expect(journalLineInserts).toHaveLength(6);
    const saleLines = journalLineInserts.slice(2);
    const cashDr = saleLines.find((l) => l.values[3] === FIXTURE_IDS.accounts.cashA);
    const incomeCr = saleLines.find((l) => l.values[3] === FIXTURE_IDS.accounts.revenueA);
    const hppDr = saleLines.find((l) => l.values[3] === FIXTURE_IDS.accounts.cogsA);
    const inventoryCr = saleLines.find((l) => l.values[3] === FIXTURE_IDS.accounts.inventoryA);
    expect(cashDr?.values[4]).toBe(200000); // 4 × 50.000
    expect(incomeCr?.values[5]).toBe(200000);
    expect(hppDr?.values[4]).toBe(120000); // 4 × 30.000 WAC
    expect(inventoryCr?.values[5]).toBe(120000);

    const movementInserts = f.db.statements.filter((s) =>
      s.sql.includes("INSERT INTO stock_movements"),
    );
    const saleMovement = movementInserts.find((m) => m.values[4] === -4000);
    expect(saleMovement).toBeDefined();
    expect(saleMovement!.values[5]).toBe(30000 * 10000); // WAC saat jual
    expect(saleMovement!.values[6]).toBe(120000);

    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(product?.current_stock_milli).toBe(6000);
    expect(product?.average_cost_minor).toBe(30000 * 10000); // WAC tidak berubah

    // Laporan (rentang Juni termasuk seed: cash_in 2jt + sewa 1,2jt):
    // pendapatan 2,2jt, HPP 120rb + sewa 1,2jt, laba bersih 880rb.
    const pl = await getProfitLoss(d, ORG_A, "2026-06-01", "2026-06-30");
    expect(pl.income.total).toBe(2200000);
    expect(pl.expense.total).toBe(1320000);
    expect(pl.netIncome).toBe(880000);
    const bs = await getBalanceSheet(d, ORG_A, "2026-06-30");
    expect(bs.assets.find((a) => a.code === "1130")?.amount).toBe(180000);
  });

  it("rejects selling more than available stock", async () => {
    const d = db();
    await purchaseKopi(d, 2, 30000, "idem-inv-sale-0003");
    await expectHttpCode(
      postTransaction(d, ORG_A, OWNER_A, {
        transactionType: "cash_in",
        transactionDate: "2026-06-20",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.revenueA,
        description: "Jual kebanyakan",
        idempotencyKey: "idem-inv-sale-0004",
        items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: 3, unitPriceIdr: 50000 }],
      }),
      "insufficient_stock",
    );
  });

  it("rejects items on non-cash_in transaction types", async () => {
    await expectHttpCode(
      postTransaction(db(), ORG_A, OWNER_A, {
        transactionType: "cash_out",
        transactionDate: "2026-06-20",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        counterAccountId: FIXTURE_IDS.accounts.expenseRentA,
        amountIdr: 100000,
        description: "Beban",
        idempotencyKey: "idem-inv-sale-0005",
        items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: 1, unitPriceIdr: 50000 }],
      }),
      "items_not_allowed",
    );
  });
});

describe("void restores stock & WAC", () => {
  it("voiding a purchase reverses stock and removes the inventory balance", async () => {
    const d = db();
    await purchaseKopi(d, 5, 20000, "idem-inv-void-0001");
    await purchaseKopi(d, 3, 10000, "idem-inv-void-0002");

    const productBefore = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(productBefore?.current_stock_milli).toBe(8000);
    expect(productBefore?.average_cost_minor).toBe(16250 * 10000); // (5×20k+3×10k)/8

    const txns = await listTransactions(d, ORG_A, {
      transactionType: "purchase",
    });
    const first = txns[0];
    await voidTransaction(d, ORG_A, OWNER_A, first.id, { reason: "Salah harga" });

    const productAfter = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(productAfter?.current_stock_milli).toBe(3000);
    expect(productAfter?.average_cost_minor).toBe(10000 * 10000);

    const bs = await getBalanceSheet(d, ORG_A, "2026-12-31");
    expect(bs.assets.find((a) => a.code === "1130")?.amount).toBe(30000);
  });

  it("voiding a goods sale restores stock", async () => {
    const d = db();
    await purchaseKopi(d, 10, 30000, "idem-inv-void-0003");
    const sale = await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "cash_in",
      transactionDate: "2026-06-20",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.revenueA,
      description: "Jual 4 bungkus",
      idempotencyKey: "idem-inv-void-0004",
      items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: 4, unitPriceIdr: 50000 }],
    });
    await voidTransaction(d, ORG_A, OWNER_A, sale.transaction_id, { reason: "Retur" });

    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(product?.current_stock_milli).toBe(10000);

    const bs = await getBalanceSheet(d, ORG_A, "2026-12-31");
    expect(bs.assets.find((a) => a.code === "1130")?.amount).toBe(300000);
  });
});

describe("getTransaction items", () => {
  it("returns item detail for purchase transactions", async () => {
    const d = db();
    const result = await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "purchase",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      description: "Beli kopi",
      idempotencyKey: "idem-inv-detail-0001",
      items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: 2, unitCostIdr: 15000 }],
    });

    const txn = await getTransaction(d, ORG_A, result.transaction_id);
    expect(txn.items).not.toBeNull();
    expect(txn.items).toHaveLength(1);
    expect(txn.items![0].product_code).toBe("PRD-0001");
    expect(txn.items![0].quantity).toBe(2);
    expect(txn.items![0].cost_total_idr).toBe(30000);
  });

  it("returns null items for plain transactions", async () => {
    const d = db();
    const result = await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "cash_in",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.revenueA,
      amountIdr: 50000,
      description: "Jasa",
      idempotencyKey: "idem-inv-detail-0002",
    });
    const txn = await getTransaction(d, ORG_A, result.transaction_id);
    expect(txn.items).toBeNull();
  });
});

describe("products CRUD", () => {
  it("creates a product with an auto-generated code", async () => {
    const d = db();
    const product = await createProduct(d, ORG_A, OWNER_A, {
      name: "Teh Botol",
      unit: "botol",
      sellingPriceIdr: 5000,
    });
    expect(product.code).toBe("PRD-0003");
    expect(product.current_stock).toBe(0);
    expect(product.average_cost_idr).toBe(0);
  });

  it("rejects a duplicate product name", async () => {
    await expectHttpCode(
      createProduct(db(), ORG_A, OWNER_A, { name: "Kopi Bubuk 250g", unit: "bungkus" }),
      "product_name_taken",
    );
  });

  it("patches name, unit, selling price and active state", async () => {
    const d = db();
    const updated = await patchProduct(d, ORG_A, OWNER_A, FIXTURE_IDS.products.kopiA, {
      name: "Kopi Bubuk Premium",
      unit: "pak",
      sellingPriceIdr: 60000,
    });
    expect(updated.name).toBe("Kopi Bubuk Premium");
    expect(updated.unit).toBe("pak");
    expect(updated.selling_price_idr).toBe(60000);

    const deactivated = await patchProduct(d, ORG_A, OWNER_A, FIXTURE_IDS.products.gulaA, {
      isActive: false,
    });
    expect(deactivated.is_active).toBe(0);
  });

  it("rejects deactivating a product used by posted movements", async () => {
    const d = db();
    await purchaseKopi(d, 1, 10000, "idem-inv-prod-0001");
    expect(await productIsUsed(d, ORG_A, FIXTURE_IDS.products.kopiA)).toBe(true);
    await expectHttpCode(
      patchProduct(d, ORG_A, OWNER_A, FIXTURE_IDS.products.kopiA, { isActive: false }),
      "product_in_use",
    );
  });

  it("lists only active products by default and includes inactive with flag", async () => {
    const d = db();
    await patchProduct(d, ORG_A, OWNER_A, FIXTURE_IDS.products.gulaA, { isActive: false });
    const active = await listProducts(d, ORG_A);
    expect(active.map((p) => p.id)).not.toContain(FIXTURE_IDS.products.gulaA);
    const all = await listProducts(d, ORG_A, { includeInactive: true });
    expect(all.map((p) => p.id)).toContain(FIXTURE_IDS.products.gulaA);
  });
});

describe("tenant isolation for inventory", () => {
  it("scopes products to their organization", async () => {
    const d = db();
    const productsA = await listProducts(d, ORG_A, { includeInactive: true });
    const productsB = await listProducts(d, ORG_B, { includeInactive: true });
    expect(productsA.every((p) => p.id !== FIXTURE_IDS.products.kopiB)).toBe(true);
    expect(productsB.map((p) => p.id)).toEqual([FIXTURE_IDS.products.kopiB]);
  });

  it("posts an Org B purchase against Org B products and accounts", async () => {
    const f = fresh();
    const d = db(f);
    await postTransaction(d, ORG_B, OWNER_B, {
      transactionType: "purchase",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashB,
      description: "Beli kopi B",
      idempotencyKey: "idem-inv-orgb-0001",
      items: [{ productId: FIXTURE_IDS.products.kopiB, quantity: 2, unitCostIdr: 40000 }],
    });

    const product = await getProduct(d, ORG_B, FIXTURE_IDS.products.kopiB);
    expect(product?.current_stock_milli).toBe(2000);
    // Produk Org A tidak terpengaruh.
    const productA = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(productA?.current_stock_milli).toBe(0);

    const journalLineInserts = f.db.statements.filter((s) =>
      s.sql.includes("INSERT INTO journal_lines"),
    );
    expect(journalLineInserts[0].values[3]).toBe(FIXTURE_IDS.accounts.inventoryB);
    expect(journalLineInserts[1].values[3]).toBe(FIXTURE_IDS.accounts.cashB);
  });

  it("rejects a purchase referencing another org's product", async () => {
    await expectHttpCode(
      postTransaction(db(), ORG_A, OWNER_A, {
        transactionType: "purchase",
        transactionDate: "2026-06-15",
        cashAccountId: FIXTURE_IDS.accounts.cashA,
        description: "Beli produk org lain",
        idempotencyKey: "idem-inv-cross-0001",
        items: [{ productId: FIXTURE_IDS.products.kopiB, quantity: 1, unitCostIdr: 10000 }],
      }),
      "product_inactive",
    );
  });
});

describe("recalculateProductCosts", () => {
  it("replays movements to recompute stock & WAC (self-healing)", async () => {
    const d = db();
    await purchaseKopi(d, 4, 10000, "idem-inv-recalc-0001");
    await purchaseKopi(d, 4, 20000, "idem-inv-recalc-0002");
    const result = await recalculateProductCosts(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(result.current_stock_milli).toBe(8000);
    expect(result.average_cost_minor).toBe(15000 * 10000);
    // Saldo Persediaan di neraca ikut terbaca dari jurnal (tidak bergantung cache).
    const bs = await getBalanceSheet(d, ORG_A, "2026-12-31");
    expect(bs.assets.find((a) => a.code === "1130")?.amount).toBe(120000);
  });
});
describe("atomic inventory commit (split-transaction guard)", () => {
  it("writes product cache updates in the same batch as journals and movements", async () => {
    const f = fresh();
    const d = db(f);
    const batches: string[][] = [];
    const origBatch = f.db.batch.bind(f.db);
    f.db.batch = (async (stmts: FakeD1Statement[]) => {
      batches.push(stmts.map((s) => s.sql));
      return origBatch(stmts);
    }) as typeof f.db.batch;

    const result = await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "purchase",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      description: "Beli kopi dan gula",
      idempotencyKey: "idem-atomic-batch-0001",
      items: [
        { productId: FIXTURE_IDS.products.kopiA, quantity: 2, unitCostIdr: 10000 },
        { productId: FIXTURE_IDS.products.gulaA, quantity: 1, unitCostIdr: 18000 },
      ],
    });
    expect(result.status).toBe("posted");

    // Satu batch atomik berisi jurnal + movements + kedua cache update
    // ber-guard — crash di tengah tidak bisa menyisakan movement tanpa cache.
    expect(batches).toHaveLength(1);
    const [only] = batches;
    expect(only.some((s) => s.includes("INSERT INTO journal_lines"))).toBe(true);
    expect(only.some((s) => s.includes("INSERT INTO stock_movements"))).toBe(true);
    const productUpdates = only.filter((s) => s.includes("UPDATE products"));
    expect(productUpdates).toHaveLength(2);
    expect(
      productUpdates.every((s) => s.includes("AND current_stock_milli = ?")),
    ).toBe(true);
  });
});

describe("guarded stock UPDATE honesty (retry signal)", () => {
  it("reports zero changes when the guard does not match", async () => {
    const f = fresh();
    const d = db(f);
    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    const res = await d
      .prepare(
        `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, updated_at = ?
         WHERE id = ? AND organization_id = ? AND current_stock_milli = ? AND average_cost_minor = ?`,
      )
      .bind(
        999,
        999,
        Date.now(),
        FIXTURE_IDS.products.kopiA,
        ORG_A,
        (product?.current_stock_milli ?? 0) + 1,
        product?.average_cost_minor ?? 0,
      )
      .run();
    expect(res.meta.changes).toBe(0);
  });
});

describe("concurrent writer during commit", () => {
  it("recovers via guarded catch-up with correct final stock and WAC", async () => {
    const f = fresh();
    const d = db(f);
    const origBatch = f.db.batch.bind(f.db);
    let tampered = false;
    f.db.batch = (async (stmts: FakeD1Statement[]) => {
      if (!tampered) {
        tampered = true;
        // Penulis konkuren mendarat di antara baca dan batch kami:
        // movement + cache untuk 5 unit @20000 (stok 5000, wac 2e8).
        await d
          .prepare(
            `INSERT INTO stock_movements (
               id, organization_id, transaction_id, product_id, quantity_milli,
               unit_cost_minor, cost_total_idr, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            "concurrence-txn-0001",
            ORG_A,
            "concurrence-txn-0001",
            FIXTURE_IDS.products.kopiA,
            5000,
            200000000,
            100000,
            Date.now(),
          )
          .run();
        await d
          .prepare(
            `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, updated_at = ?
             WHERE id = ? AND organization_id = ?`,
          )
          .bind(5000, 200000000, Date.now(), FIXTURE_IDS.products.kopiA, ORG_A)
          .run();
      }
      return origBatch(stmts);
    }) as typeof f.db.batch;

    const result = await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "purchase",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      description: "Beli 2 bungkus kopi",
      idempotencyKey: "idem-atomic-retry-0001",
      items: [{ productId: FIXTURE_IDS.products.kopiA, quantity: 2, unitCostIdr: 10000 }],
    });
    expect(result.status).toBe("posted");

    // Guard batch pertama meleset (cache 0/0 -> 5000/2e8), catch-up menghitung
    // ulang dari nilai kini: stok 7000, WAC floor((5*2e8 + 2*1e8)/7).
    const product = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(product?.current_stock_milli).toBe(7000);
    expect(product?.average_cost_minor).toBe(171428571);
  });
});

describe("atomic void (split-transaction guard)", () => {
  it("voids status, cache restore, and audit log in a single batch", async () => {
    const f = fresh();
    const d = db(f);
    const posted = await postTransaction(d, ORG_A, OWNER_A, {
      transactionType: "purchase",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      description: "Beli untuk dibatalkan",
      idempotencyKey: "idem-atomic-void-0001",
      items: [
        { productId: FIXTURE_IDS.products.kopiA, quantity: 2, unitCostIdr: 10000 },
        { productId: FIXTURE_IDS.products.gulaA, quantity: 1, unitCostIdr: 18000 },
      ],
    });

    const batches: string[][] = [];
    const origBatch = f.db.batch.bind(f.db);
    f.db.batch = (async (stmts: FakeD1Statement[]) => {
      batches.push(stmts.map((s) => s.sql));
      return origBatch(stmts);
    }) as typeof f.db.batch;

    const voided = await voidTransaction(d, ORG_A, OWNER_A, posted.transaction_id, {
      reason: "Salah input",
    });
    expect(voided.status).toBe("voided");

    // Satu batch atomik: status + restore cache kedua produk + audit.
    // Crash di tengah tidak bisa menyisakan status voided dengan cache basi.
    expect(batches).toHaveLength(1);
    const [only] = batches;
    expect(only.some((s) => s.includes("UPDATE transactions"))).toBe(true);
    expect(only.filter((s) => s.includes("UPDATE products"))).toHaveLength(2);
    expect(only.some((s) => s.includes("INSERT INTO audit_logs"))).toBe(true);

    // Cache pulih dari riwayat (tanpa movement voided): kembali nol.
    const kopi = await getProduct(d, ORG_A, FIXTURE_IDS.products.kopiA);
    expect(kopi?.current_stock_milli).toBe(0);
    expect(kopi?.average_cost_minor).toBe(0);
  });
});
