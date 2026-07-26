import { generateId } from "../auth/tokens";
import {
  type ImportValidator,
  type ImportWriter,
  importInsertLoop,
  checkDuplicate,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateRow(row: Record<string, string>, _: number) {
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
  async insert(db, organizationId, _createdBy, rows) {
    const now = Date.now();

    return await importInsertLoop(rows, async (row) => {
      const productId = generateId();

      // Check for duplicate code
      const errors: { row: number; field: string; message: string }[] = [];
      const isDup = await checkDuplicate(db, "products", "code", organizationId, row.parsed.code, row.index, errors);
      if (isDup) return { id: null, errors };

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

      return { id: productId };
    });
  },
};
