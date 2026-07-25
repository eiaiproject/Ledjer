import { generateId } from "../auth/tokens";
import {
  type ImportValidator,
  type ImportWriter,
  validateRequiredField,
  validateOptionalField,
  validateIntegerField,
} from "./import.service";

export interface ProductImportRow {
  code: string;
  name: string;
  description: string | null;
  unit: string;
  purchasePriceMinor: number | null;
  sellingPriceMinor: number | null;
  minStockMilli: number | null;
}

export const productImportValidator: ImportValidator<ProductImportRow> = {
  name: "products",
  requiredHeaders: ["kode", "nama"],
  validateRow(row: Record<string, string>, index: number) {
    void index;
    const errors: { field: string; message: string }[] = [];

    const code = validateRequiredField(row, "kode", errors);
    const name = validateRequiredField(row, "nama", errors);
    const description = validateOptionalField(row, "deskripsi");
    const unit = row["satuan"]?.trim() || "pcs";
    const purchasePriceMinor = validateIntegerField(row, "harga_beli", errors, 0);
    const sellingPriceMinor = validateIntegerField(row, "harga_jual", errors, 0);
    const minStockMilli = validateIntegerField(row, "stok_minimum", errors, 0);

    if (!code || !name) {
      return { parsed: null, errors };
    }

    return {
      parsed: {
        code,
        name,
        description,
        unit,
        purchasePriceMinor,
        sellingPriceMinor,
        minStockMilli,
      },
      errors,
    };
  },
};

export const productImportWriter: ImportWriter<ProductImportRow> = {
  async insert(db, organizationId, createdBy, rows) {
    void createdBy;
    const errors: { row: number; field: string; message: string }[] = [];
    let inserted = 0;
    const createdIds: string[] = [];
    const now = Date.now();

    for (const row of rows) {
      const productId = generateId();
      try {
        const existing = await db.prepare(
          `SELECT id FROM products WHERE organization_id = ? AND code = ?`,
        ).bind(organizationId, row.parsed.code).first<{ id: string }>();
        if (existing) {
          errors.push({ row: row.index + 1, field: "kode", message: `Kode produk "${row.parsed.code}" sudah ada` });
          continue;
        }

        await db.prepare(
          `INSERT INTO products (id, organization_id, code, name, description, unit, purchase_price_minor, selling_price_minor, average_cost_minor, current_stock_milli, min_stock_milli, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 1, ?, ?)`,
        ).bind(
          productId, organizationId, row.parsed.code, row.parsed.name,
          row.parsed.description ?? null, row.parsed.unit,
          row.parsed.purchasePriceMinor ?? 0,
          row.parsed.sellingPriceMinor ?? 0,
          row.parsed.minStockMilli ?? 0,
          now, now,
        ).run();
        inserted++;
        createdIds.push(productId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        errors.push({ row: row.index + 1, field: "_db", message: `Gagal menyimpan: ${msg}` });
      }
    }

    return { inserted, errors, createdIds };
  },
};
