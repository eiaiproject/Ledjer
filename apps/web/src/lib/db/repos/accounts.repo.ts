/**
 * Accounts repository — read/write accounts from local SQLite.
 *
 * Query functions return data directly from the local DB.
 * Write functions insert/update the local DB AND append to sync_outbox.
 */

import type { Database } from "@sqlite.org/sqlite-wasm";
import type { Account } from "@/lib/accounting/types";
import { appendOutbox } from "./outbox.repo";

/** Map a raw row array to an Account object. */
function rowToAccount(row: unknown[]): Account {
  return {
    id: String(row[0]),
    user_id: String(row[1]),
    code: String(row[2]),
    name: String(row[3]),
    account_class: String(row[4]) as Account["account_class"],
    account_subtype: row[5] as string | null,
    account_kind: row[6] as string | null,
    is_system: Number(row[7]),
    is_active: Number(row[8]),
  };
}

function queryAccounts(db: Database, sql: string, bind?: unknown[]): Account[] {
  const stmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (bind) stmt.bind(bind as any);
  const results: Account[] = [];
  while (stmt.step()) {
    results.push(rowToAccount(stmt.get([])));
  }
  stmt.finalize();
  return results;
}

function queryOneAccount(db: Database, sql: string, bind?: unknown[]): Account | null {
  const stmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (bind) stmt.bind(bind as any);
  let result: Account | null = null;
  if (stmt.step()) {
    result = rowToAccount(stmt.get([]));
  }
  stmt.finalize();
  return result;
}

// ── Read ─────────────────────────────────────────────────────────

/** Fetch all accounts for a user (including inactive). */
export function getAllAccounts(db: Database, userId: string): Account[] {
  return queryAccounts(
    db,
    `SELECT id, user_id, code, name, account_class, account_subtype,
            account_kind, is_system, is_active
     FROM accounts WHERE user_id = ? ORDER BY code`,
    [userId],
  );
}

/** Fetch only active accounts for a user. */
export function getActiveAccounts(db: Database, userId: string): Account[] {
  return queryAccounts(
    db,
    `SELECT id, user_id, code, name, account_class, account_subtype,
            account_kind, is_system, is_active
     FROM accounts WHERE user_id = ? AND is_active = 1 ORDER BY code`,
    [userId],
  );
}

/** Fetch accounts by subtype (cash, bank). */
export function getAccountsBySubtype(db: Database, userId: string, subtype: string): Account[] {
  return queryAccounts(
    db,
    `SELECT id, user_id, code, name, account_class, account_subtype,
            account_kind, is_system, is_active
     FROM accounts WHERE user_id = ? AND account_subtype = ? AND is_active = 1 ORDER BY code`,
    [userId, subtype],
  );
}

/** Find a single account by ID. */
export function getAccountById(db: Database, accountId: string): Account | null {
  return queryOneAccount(
    db,
    `SELECT id, user_id, code, name, account_class, account_subtype,
            account_kind, is_system, is_active
     FROM accounts WHERE id = ?`,
    [accountId],
  );
}

// ── Write (local + outbox) ───────────────────────────────────────

/** Create a new account in local DB + outbox. */
export function createAccountLocal(
  db: Database,
  userId: string,
  input: {
    code: string;
    name: string;
    accountClass: Account["account_class"];
    accountSubtype?: string | null;
    accountKind?: string | null;
  },
): Account {
  const id = crypto.randomUUID();
  const now = Date.now();
  const subtype = input.accountSubtype ?? null;
  const kind = input.accountKind ?? null;

  db.exec({
    sql: `INSERT INTO accounts (id, user_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    bind: [id, userId, input.code, input.name, input.accountClass, subtype, kind, now, now],
  });

  appendOutbox(db, userId, "account", id, "create", {
    code: input.code,
    name: input.name,
    accountClass: input.accountClass,
    accountSubtype: subtype,
    accountKind: kind,
  });

  return getAccountById(db, id)!;
}

/** Patch an account in local DB + outbox. */
export function patchAccountLocal(
  db: Database,
  accountId: string,
  input: { name?: string; isActive?: boolean },
): Account {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const binds: unknown[] = [now];

  if (input.name !== undefined) {
    sets.push("name = ?");
    binds.push(input.name);
  }
  if (input.isActive !== undefined) {
    sets.push("is_active = ?");
    binds.push(input.isActive ? 1 : 0);
  }

  binds.push(accountId);
  db.exec({
    sql: `UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bind: binds as any,
  });

  const account = getAccountById(db, accountId);
  if (account) {
    appendOutbox(db, account.user_id, "account", accountId, "update", input);
  }

  return account!;
}
