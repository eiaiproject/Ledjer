/**
 * P1.1: Opening-balances import via CSV.
 *
 * Expected CSV columns:
 *   kode_akun  - Account code (e.g. "1110", "1300")
 *   saldo      - Balance amount in IDR (positive = normal direction)
 *   deskripsi  - Optional description
 *
 * The validator looks up accounts by code and validates debit = credit.
 * The writer delegates to postOpeningBalance() from opening-balance.service.ts
 * to create the actual journal entries.
 */

import type { ImportValidator, ImportWriter } from "./import.service";
import { validateRequiredField, validateOptionalField, validateIntegerField } from "./import.service";
import { postOpeningBalance } from "./opening-balance.service";

export interface OpeningBalanceImportRow {
  accountId: string;
  accountCode: string;
  amount: number;
  description: string | null;
}

export interface OpeningBalanceImportContext {
  /** Pre-fetched account code → id mapping */
  accountsByCode: Record<string, { id: string }>;
}

export function createOpeningBalanceValidator(
  accountsByCode: Record<string, { id: string }>,
): ImportValidator<OpeningBalanceImportRow> {
  return {
    name: "opening balances",
    requiredHeaders: ["kode_akun", "saldo"],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validateRow(row: Record<string, string>, _: number) {
      const errors: { field: string; message: string }[] = [];

      const rawCode = validateRequiredField(row, "kode_akun", errors);
      const rawAmount = validateIntegerField(row, "saldo", errors);
      const description = validateOptionalField(row, "deskripsi");

      let accountId: string | null = null;
      if (rawCode) {
        const match = accountsByCode[rawCode];
        if (!match) {
          errors.push({ field: "kode_akun", message: `Akun dengan kode "${rawCode}" tidak ditemukan` });
        } else {
          accountId = match.id;
        }
      }

      if (!rawCode || rawAmount === null || !accountId) {
        return { parsed: null, errors };
      }

      return {
        parsed: {
          accountId,
          accountCode: rawCode,
          amount: rawAmount,
          description,
        },
        errors,
      };
    },
  };
}

export const openingBalanceImportWriter: ImportWriter<OpeningBalanceImportRow> = {
  async insert(db, organizationId, createdBy, rows) {
    const errors: { row: number; field: string; message: string }[] = [];

    if (rows.length === 0) {
      return { inserted: 0, errors };
    }

    // Use the existing postOpeningBalance to create journal entries
    try {
      const result = await postOpeningBalance(db, organizationId, createdBy, {
        date: new Date().toISOString().slice(0, 10),
        lines: rows.map((r) => ({
          accountId: r.parsed.accountId,
          amount: r.parsed.amount,
        })),
      });
      return { inserted: rows.length, errors, createdIds: [result.journalEntryId] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: 0, field: "_db", message: `Gagal posting saldo awal: ${msg}` });
      return { inserted: 0, errors };
    }
  },
};
