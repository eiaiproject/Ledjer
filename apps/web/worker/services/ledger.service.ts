import { executeBatch, statement } from "../db/client";
import type { AccountClass } from "../db/schema";

interface DefaultAccount {
  code: string;
  name: string;
  accountClass: AccountClass;
  accountSubtype?: "cash" | "bank";
  accountKind?: "inventory" | "cogs";
  isSystem: boolean;
}

// PRD §10.8 — chart of accounts default MVP.
export const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  { code: "1110", name: "Kas", accountClass: "asset", accountSubtype: "cash", isSystem: true },
  { code: "1120", name: "Bank", accountClass: "asset", accountSubtype: "bank", isSystem: true },
  { code: "1130", name: "Persediaan", accountClass: "asset", accountKind: "inventory", isSystem: true },
  { code: "3110", name: "Modal Pemilik", accountClass: "equity", isSystem: true },
  { code: "3120", name: "Pengambilan Pemilik", accountClass: "equity", isSystem: true },
  { code: "4110", name: "Pendapatan Usaha", accountClass: "income", isSystem: true },
  { code: "4120", name: "Pendapatan Lain", accountClass: "income", isSystem: true },
  { code: "6110", name: "Beban Gaji & Upah", accountClass: "expense", isSystem: true },
  { code: "6120", name: "Beban Sewa", accountClass: "expense", isSystem: true },
  { code: "6130", name: "Beban Pemasaran", accountClass: "expense", isSystem: true },
  { code: "6140", name: "Beban Transportasi", accountClass: "expense", isSystem: true },
  { code: "6150", name: "Beban Komunikasi & Internet", accountClass: "expense", isSystem: true },
  { code: "6160", name: "Beban Perlengkapan", accountClass: "expense", isSystem: true },
  { code: "6170", name: "Beban Administrasi", accountClass: "expense", isSystem: true },
  { code: "6180", name: "Beban Lain-lain", accountClass: "expense", isSystem: true },
  { code: "6190", name: "Harga Pokok Penjualan", accountClass: "expense", accountKind: "cogs", isSystem: true },
];

function defaultAccountStatements(db: D1Database, userId: string, current: number) {
  return DEFAULT_ACCOUNTS.map((account) =>
    statement(
      db,
      `INSERT INTO accounts (
         id, user_id, code, name, account_class, account_subtype,
         account_kind, is_system, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        crypto.randomUUID(),
        userId,
        account.code,
        account.name,
        account.accountClass,
        account.accountSubtype ?? null,
        account.accountKind ?? null,
        account.isSystem ? 1 : 0,
        current,
        current,
      ],
    ),
  );
}

/**
 * Seed the default MVP chart of accounts for a user's book. Called by
 * registration and by Google sign-up so every book starts usable.
 */
export async function createDefaultAccounts(
  db: D1Database,
  userId: string,
  current = Date.now(),
): Promise<void> {
  await executeBatch(db, defaultAccountStatements(db, userId, current));
}
