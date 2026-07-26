import { type AccountType, type NormalBalance } from "../db/schema";
import { generateId } from "../auth/tokens";
import {
  type ImportValidator,
  type ImportWriter,
  importInsertLoop,
  checkDuplicate,
  validateRequiredField,
  validateOptionalField,
} from "./import.service";

export interface CoaImportRow {
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentCode: string | null;
  isCashAccount: boolean;
  cashAccountType: string | null;
  reportGroup: string | null;
}

/** Map Indonesian labels to English account types */
const ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  "aset": "asset",
  "asset": "asset",
  "aktiva": "asset",
  "kewajiban": "liability",
  "liability": "liability",
  "pasiva": "liability",
  "ekuitas": "equity",
  "equity": "equity",
  "modal": "equity",
  "pendapatan": "revenue",
  "revenue": "revenue",
  "penjualan": "revenue",
  "hpp": "cogs",
  "cogs": "cogs",
  "beban": "expense",
  "expense": "expense",
  "biaya": "expense",
  "pendapatan_lain": "other_income",
  "other_income": "other_income",
  "beban_lain": "other_expense",
  "other_expense": "other_expense",
};

const NORMAL_BALANCE_MAP: Record<string, NormalBalance> = {
  "debit": "debit",
  "debet": "debit",
  "dr": "debit",
  "kredit": "credit",
  "credit": "credit",
  "cr": "credit",
};

export const coaImportValidator: ImportValidator<CoaImportRow> = {
  name: "chart of accounts",
  requiredHeaders: ["kode", "nama", "tipe"],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateRow(row: Record<string, string>, _: number) {
    const errors: { field: string; message: string }[] = [];

    const code = validateRequiredField(row, "kode", errors);
    const name = validateRequiredField(row, "nama", errors);
    const rawType = row["tipe"]?.trim().toLowerCase();
    const accountType = rawType ? (ACCOUNT_TYPE_MAP[rawType] ?? null) : null;

    if (!accountType && rawType) {
      errors.push({ field: "tipe", message: `Tipe akun "${rawType}" tidak dikenal. Gunakan: aset, kewajiban, ekuitas, pendapatan, hpp, beban, pendapatan_lain, beban_lain` });
    } else if (!rawType) {
      errors.push({ field: "tipe", message: "Tipe akun harus diisi" });
    }

    const rawNormal = row["normal_saldo"]?.trim().toLowerCase();
    const normalBalance = rawNormal ? (NORMAL_BALANCE_MAP[rawNormal] ?? null) : null;
    if (rawNormal && !normalBalance) {
      errors.push({ field: "normal_saldo", message: `Normal saldo "${rawNormal}" tidak dikenal. Gunakan: debit atau kredit` });
    }

    // Infer normal balance from account type if not explicitly given
    const inferredBalance: NormalBalance =
      normalBalance ?? (accountType === "asset" || accountType === "expense" || accountType === "cogs" ? "debit" : "credit");

    const parentCode = validateOptionalField(row, "kode_induk");
    const isCashAccount = row["akun_kas"]?.trim().toLowerCase() === "ya";
    const cashAccountTypeRaw = row["tipe_kas"]?.trim().toLowerCase();
    const cashAccountType = ["cash", "bank", "qris"].includes(cashAccountTypeRaw ?? "") ? cashAccountTypeRaw : null;
    const reportGroup = validateOptionalField(row, "grup_laporan");

    if (!code || !name || !accountType) {
      return {
        parsed: null,
        errors,
      };
    }

    return {
      parsed: {
        code,
        name,
        accountType,
        normalBalance: inferredBalance,
        parentCode,
        isCashAccount,
        cashAccountType,
        reportGroup,
      },
      errors,
    };
  },
};

export const coaImportWriter: ImportWriter<CoaImportRow> = {
  async insert(db, organizationId, _createdBy, rows) {
    const errors: { row: number; field: string; message: string }[] = [];
    const now = Date.now();

    // Process parent-first by sorting rows by depth (parent code length)
    const sorted = [...rows].sort((a, b) => {
      return countDots(a.parsed.code) - countDots(b.parsed.code);
    });

    const result = await importInsertLoop(sorted, async (row) => {
      const accountId = generateId();

      // Validate code is numeric
      const codeNum = Number.parseInt(row.parsed.code, 10);
      if (Number.isNaN(codeNum)) {
        return { id: null, errors: [{ row: row.index + 1, field: "kode", message: `Kode akun "${row.parsed.code}" bukan angka` }] };
      }

      // Check duplicate code
      const isDup = await checkDuplicate(db, "accounts", "code", organizationId, row.parsed.code, row.index, errors);
      if (isDup) return { id: null };

      // Look up parent account if specified
      let parentId: string | null = null;
      if (row.parsed.parentCode) {
        const existing = await db.prepare(
          `SELECT id FROM accounts WHERE organization_id = ? AND code = ?`,
        ).bind(organizationId, row.parsed.parentCode).first<{ id: string }>();
        parentId = existing?.id ?? null;
      }

      await db.prepare(
        `INSERT INTO accounts (id, organization_id, code, name, account_type, normal_balance, parent_account_id, is_system, is_locked, is_active, is_cash_account, cash_account_type, report_group, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        accountId, organizationId, row.parsed.code, row.parsed.name,
        row.parsed.accountType, row.parsed.normalBalance,
        parentId, 0, 0, 1,
        row.parsed.isCashAccount ? 1 : 0,
        row.parsed.cashAccountType,
        row.parsed.reportGroup, now, now,
      ).run();

      return { id: accountId };
    });

    // Merge pre-loop errors
    return {
      inserted: result.inserted,
      errors: [...errors, ...result.errors],
      createdIds: result.createdIds,
    };
  },
};

function countDots(code: string): number {
  return (code.match(/\./g) ?? []).length;
}
