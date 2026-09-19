/**
 * Default chart of accounts (CoA) — mirrors DEFAULT_ACCOUNTS in ledger.service.ts.
 *
 * 16 akun default dibuat saat pendaftaran user baru.
 * Untuk local-first, seed ini jalan di SQLite-WASM di browser.
 */

export interface SeedAccount {
  code: string;
  name: string;
  accountClass: "asset" | "liability" | "equity" | "income" | "expense";
  accountSubtype: string | null;
  accountKind: string | null;
}

export const DEFAULT_ACCOUNTS: readonly SeedAccount[] = [
  { code: "1110", name: "Kas",                   accountClass: "asset",   accountSubtype: "cash",    accountKind: null },
  { code: "1120", name: "Bank",                  accountClass: "asset",   accountSubtype: "bank",    accountKind: null },
  { code: "1130", name: "Persediaan",            accountClass: "asset",   accountSubtype: null,      accountKind: "inventory" },
  { code: "3110", name: "Modal Pemilik",         accountClass: "equity",  accountSubtype: null,      accountKind: null },
  { code: "3120", name: "Pengambilan Pemilik",   accountClass: "equity",  accountSubtype: null,      accountKind: null },
  { code: "4110", name: "Pendapatan Usaha",      accountClass: "income",  accountSubtype: null,      accountKind: null },
  { code: "4120", name: "Pendapatan Lain",       accountClass: "income",  accountSubtype: null,      accountKind: null },
  { code: "6110", name: "Beban Gaji & Upah",     accountClass: "expense", accountSubtype: null,      accountKind: null },
  { code: "6120", name: "Beban Sewa",            accountClass: "expense", accountSubtype: null,      accountKind: null },
  { code: "6130", name: "Beban Pemasaran",       accountClass: "expense", accountSubtype: null,      accountKind: null },
  { code: "6140", name: "Beban Transportasi",    accountClass: "expense", accountSubtype: null,      accountKind: null },
  { code: "6150", name: "Beban Komunikasi & Internet", accountClass: "expense", accountSubtype: null, accountKind: null },
  { code: "6160", name: "Beban Perlengkapan",    accountClass: "expense", accountSubtype: null,      accountKind: null },
  { code: "6170", name: "Beban Administrasi",    accountClass: "expense", accountSubtype: null,      accountKind: null },
  { code: "6180", name: "Beban Lain-lain",       accountClass: "expense", accountSubtype: null,      accountKind: null },
  { code: "6190", name: "Harga Pokok Penjualan", accountClass: "expense", accountSubtype: null,      accountKind: "cogs" },
] as const;

/**
 * Insert default accounts into a SQLite database for a given user.
 * Uses sqlite-wasm OO1 exec with bind — aman dari injeksi.
 */
export function seedDefaultAccounts(
  db: {
    exec(sql: string | { sql: string; bind: unknown[] }): void;
  },
  userId: string,
  createdAt: number = Date.now(),
): void {
  for (const acct of DEFAULT_ACCOUNTS) {
    const id = crypto.randomUUID();
    db.exec({
      sql: `INSERT OR IGNORE INTO accounts (id, user_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      bind: [
        id,
        userId,
        acct.code,
        acct.name,
        acct.accountClass,
        acct.accountSubtype,
        acct.accountKind,
        createdAt,
        createdAt,
      ],
    });
  }
}
