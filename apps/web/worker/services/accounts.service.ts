import { execute, queryAll, queryFirst } from "../db/client";
import { badRequest, notFound } from "../http/errors";
import { logAuthEvent } from "./auth-audit.service";
import type { AccountClass } from "../db/schema";

export interface AccountRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  account_class: AccountClass;
  account_subtype: "cash" | "bank" | null;
  account_kind: "inventory" | "cogs" | null;
  is_system: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface AccountWithBalance extends AccountRow {
  balance_idr: number;
}

export interface ListAccountsOptions {
  includeInactive?: boolean;
  class?: AccountClass;
  subtype?: "cash" | "bank";
}

const accountColumns = "id, organization_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at";

export async function listAccounts(
  db: D1Database,
  organizationId: string,
  options: ListAccountsOptions = {},
): Promise<AccountWithBalance[]> {
  const conditions = ["a.organization_id = ?"];
  const values: (string | number)[] = [organizationId];

  if (!options.includeInactive) {
    conditions.push("a.is_active = 1");
  }
  if (options.class) {
    conditions.push("a.account_class = ?");
    values.push(options.class);
  }
  if (options.subtype) {
    conditions.push("a.account_subtype = ?");
    values.push(options.subtype);
  }

  const rows = await queryAll<AccountRow>(
    db,
    `SELECT ${accountColumns} FROM accounts a WHERE ${conditions.join(" AND ")} ORDER BY a.code ASC`,
    values,
  );
  const balances = await balancesByAccount(db, organizationId);

  return rows.map((row) => ({
    ...row,
    balance_idr: balances.get(row.id) ?? 0,
  }));
}

export async function getAccount(
  db: D1Database,
  organizationId: string,
  accountId: string,
): Promise<AccountRow | null> {
  return queryFirst<AccountRow>(
    db,
    `SELECT ${accountColumns} FROM accounts WHERE id = ? AND organization_id = ?`,
    [accountId, organizationId],
  );
}

export function isCashBankAccount(account: AccountRow | null | undefined): boolean {
  return !!account && account.account_subtype !== null && account.is_active === 1;
}

/** Akun sistem bertanda (Persediaan/HPP) milik organisasi, aktif. */
export async function getAccountByKind(
  db: D1Database,
  organizationId: string,
  kind: "inventory" | "cogs",
): Promise<AccountRow | null> {
  return queryFirst<AccountRow>(
    db,
    `SELECT ${accountColumns} FROM accounts WHERE organization_id = ? AND account_kind = ? AND is_active = 1`,
    [organizationId, kind],
  );
}

/**
 * Shared account-name validation: trimmed, non-empty, length-bounded, and
 * unique within the organization (optionally excluding the account being
 * renamed). Returns the trimmed name.
 */
async function assertValidAccountName(
  db: D1Database,
  organizationId: string,
  rawName: string,
  excludeAccountId?: string,
): Promise<string> {
  const name = rawName.trim();
  if (!name) throw badRequest("account_name_required", "Nama akun harus diisi.");
  if (name.length > 80) throw badRequest("account_name_too_long", "Nama akun maksimal 80 karakter.");

  const existing = await queryFirst<{ id: string }>(
    db,
    excludeAccountId
      ? "SELECT id FROM accounts WHERE organization_id = ? AND name = ? AND id != ?"
      : "SELECT id FROM accounts WHERE organization_id = ? AND name = ?",
    excludeAccountId ? [organizationId, name, excludeAccountId] : [organizationId, name],
  );
  if (existing) throw badRequest("account_name_taken", "Nama akun sudah dipakai dalam organisasi ini.");
  return name;
}

export async function createCashBankAccount(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: { subtype: "cash" | "bank"; name: string },
): Promise<AccountRow> {
  const name = await assertValidAccountName(db, organizationId, input.name);

  const code = await nextCashBankCode(db, organizationId);
  const current = Date.now();
  const accountId = crypto.randomUUID();

  // Two concurrent creates can compute the same next code; retry with a
  // freshly computed code instead of surfacing a 500 UNIQUE violation.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const attemptCode = attempt === 0 ? code : await nextCashBankCode(db, organizationId);
    const attemptId = attempt === 0 ? accountId : crypto.randomUUID();
    try {
      await execute(
        db,
        `INSERT INTO accounts (
           id, organization_id, code, name, account_class, account_subtype,
           is_system, is_active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'asset', ?, 0, 1, ?, ?)`,
        [attemptId, organizationId, attemptCode, name, input.subtype, current, current],
      );
      await logAuthEvent(db, userId, organizationId, "account_created", { accountId: attemptId, code: attemptCode, name, subtype: input.subtype });
      const account = await getAccount(db, organizationId, attemptId);
      if (!account) throw badRequest("account_create_failed", "Gagal membuat akun.");
      return account;
    } catch (err) {
      if (attempt < 2 && err instanceof Error && /unique|constraint/i.test(err.message)) continue;
      throw err;
    }
  }
  throw badRequest("account_create_failed", "Gagal membuat akun.");
}

/** Klasifikasi yang boleh dibuat pengguna (kas/bank punya endpoint sendiri). */
export type CreatableAccountClass = "income" | "expense";

export interface CreateAccountInput {
  accountClass: CreatableAccountClass;
  name: string;
}

const ACCOUNT_CODE_PREFIX: Record<CreatableAccountClass, string> = {
  income: "4",
  expense: "6",
};

/** Kode berikutnya dalam blok klasifikasi (4130…, 6200…), lewati yang terpakai. */
export async function nextAccountCode(
  db: D1Database,
  organizationId: string,
  accountClass: CreatableAccountClass,
): Promise<string> {
  const prefix = ACCOUNT_CODE_PREFIX[accountClass];
  const row = await queryFirst<{ max_code: number | null }>(
    db,
    `SELECT MAX(CAST(code AS INTEGER)) AS max_code
     FROM accounts
     WHERE organization_id = ? AND code LIKE ?`,
    [organizationId, `${prefix}%`],
  );
  let next = (row?.max_code ?? Number(`${prefix}00`)) + 10;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!String(next).startsWith(prefix)) {
      throw badRequest("account_code_exhausted", "Blok kode akun habis. Hubungi dukungan.");
    }
    const existing = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM accounts WHERE organization_id = ? AND code = ?",
      [organizationId, String(next)],
    );
    if (!existing) return String(next);
    next += 10;
  }
  throw badRequest("account_code_exhausted", "Blok kode akun habis. Hubungi dukungan.");
}

export async function createAccount(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreateAccountInput,
): Promise<AccountRow> {
  const name = await assertValidAccountName(db, organizationId, input.name);
  const current = Date.now();
  const accountId = crypto.randomUUID();

  // Sama seperti kas/bank: retry bila kode yang dihitung menabrak tulisan paralel.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const attemptCode = await nextAccountCode(db, organizationId, input.accountClass);
    const attemptId = attempt === 0 ? accountId : crypto.randomUUID();
    try {
      await execute(
        db,
        `INSERT INTO accounts (
           id, organization_id, code, name, account_class, account_subtype,
           account_kind, is_system, is_active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, 1, ?, ?)`,
        [attemptId, organizationId, attemptCode, name, input.accountClass, current, current],
      );
      await logAuthEvent(db, userId, organizationId, "account_created", { accountId: attemptId, code: attemptCode, name });
      const account = await getAccount(db, organizationId, attemptId);
      if (!account) throw badRequest("account_create_failed", "Gagal membuat akun.");
      return account;
    } catch (err) {
      if (attempt < 2 && err instanceof Error && /unique|constraint/i.test(err.message)) continue;
      throw err;
    }
  }
  throw badRequest("account_create_failed", "Gagal membuat akun.");
}

export interface PatchAccountInput {
  name?: string;
  isActive?: boolean;
}
export async function patchAccount(
  db: D1Database,
  organizationId: string,
  accountId: string,
  userId: string,
  input: PatchAccountInput,
): Promise<AccountRow> {
  const account = await getAccount(db, organizationId, accountId);
  if (!account) throw notFound("account_not_found", "Akun tidak ditemukan.");

  const current = Date.now();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (input.name !== undefined) {
    const name = await assertValidAccountName(db, organizationId, input.name, accountId);
    updates.push("name = ?");
    values.push(name);
  }

  if (input.isActive !== undefined) {
    if (!input.isActive && account.is_system === 1) {
      throw badRequest("account_protected", "Akun sistem tidak dapat dinonaktifkan.");
    }
    if (!input.isActive && (await accountIsUsed(db, organizationId, accountId))) {
      throw badRequest("account_in_use", "Akun sudah dipakai transaksi dan tidak dapat dinonaktifkan.");
    }
    updates.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }

  if (updates.length === 0) return account;

  values.push(current, accountId, organizationId);
  await execute(
    db,
    `UPDATE accounts SET ${updates.join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`,
    values,
  );
  await logAuthEvent(db, userId, organizationId, "account_updated", { accountId, ...input });

  const updated = await getAccount(db, organizationId, accountId);
  if (!updated) throw notFound("account_not_found", "Akun tidak ditemukan.");
  return updated;
}

export async function nextCashBankCode(db: D1Database, organizationId: string): Promise<string> {
  const row = await queryFirst<{ max_code: number | null }>(
    db,
    `SELECT MAX(CAST(code AS INTEGER)) AS max_code
     FROM accounts
     WHERE organization_id = ? AND account_subtype IS NOT NULL`,
    [organizationId],
  );
  // Lewati kode yang sudah dipakai akun lain (mis. Persediaan 1130) agar
  // tidak menabrak UNIQUE(organization_id, code) pada akun kas/bank baru.
  let next = (row?.max_code ?? 1110) + 10;
  for (;;) {
    const existing = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM accounts WHERE organization_id = ? AND code = ?",
      [organizationId, String(next)],
    );
    if (!existing) return String(next);
    next += 10;
  }
}

export async function accountIsUsed(
  db: D1Database,
  organizationId: string,
  accountId: string,
): Promise<boolean> {
  const row = await queryFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM transactions
     WHERE organization_id = ? AND status = 'posted' AND (cash_account_id = ? OR counter_account_id = ?)`,
    [organizationId, accountId, accountId],
  );
  return (row?.c ?? 0) > 0;
}

/** Balance per account (in IDR) from journal lines of posted transactions. */
export async function balancesByAccount(
  db: D1Database,
  organizationId: string,
): Promise<Map<string, number>> {
  const rows = await queryAll<{ account_id: string; debit: number; credit: number }>(
    db,
    `SELECT jl.account_id, SUM(jl.debit_idr) AS debit, SUM(jl.credit_idr) AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN transactions t ON t.id = je.transaction_id
     WHERE jl.organization_id = ? AND t.status = 'posted'
     GROUP BY jl.account_id`,
    [organizationId],
  );
  return new Map(rows.map((r) => [r.account_id, (r.debit ?? 0) - (r.credit ?? 0)]));
}

/** Account balance for a single account, restricted to posted transactions. */
export async function accountBalance(
  db: D1Database,
  organizationId: string,
  accountId: string,
): Promise<number> {
  const row = await queryFirst<{ debit: number; credit: number }>(
    db,
    `SELECT SUM(jl.debit_idr) AS debit, SUM(jl.credit_idr) AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN transactions t ON t.id = je.transaction_id
     WHERE jl.organization_id = ? AND jl.account_id = ? AND t.status = 'posted'`,
    [organizationId, accountId],
  );
  return (row?.debit ?? 0) - (row?.credit ?? 0);
}