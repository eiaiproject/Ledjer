import { generateId } from "../auth/tokens";
import { execute, queryAll, queryFirst } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import {
  ACCOUNT_TYPE_VALUES,
  NORMAL_BALANCE_VALUES,
  type AccountType,
  type NormalBalance,
} from "../db/schema";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";

export type CashBankKind = "cash" | "bank" | "qris" | "ewallet";
type CashAccountType = "cash" | "bank" | "qris";

export interface PublicAccount {
  id: string;
  code: number;
  name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  parent_account_id: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  is_cash_account: boolean;
  cash_account_type: CashAccountType | null;
  report_group: string | null;
}

export interface AccountFilters {
  active?: boolean;
  cashBankOnly?: boolean;
  accountTypes?: AccountType[];
}

export interface CreateAccountInput {
  code?: number;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  isCashAccount?: boolean;
  cashAccountType?: CashAccountType;
  reportGroup?: string;
  idempotencyKey?: string;
}

export interface PatchAccountInput {
  name?: string;
  isActive?: boolean;
}

interface AccountRow {
  id: string;
  code: number;
  name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  parent_account_id: string | null;
  is_system: 0 | 1;
  is_locked: 0 | 1;
  is_active: 0 | 1;
  is_cash_account: 0 | 1;
  cash_account_type: CashAccountType | null;
  report_group: string | null;
}

interface UsedCodeRow {
  code: number;
}

const CASH_BANK_RANGES: Record<CashBankKind, { min: number; max: number; reportGroup: string; cashAccountType: CashAccountType | null }> = {
  cash: { min: 1111, max: 1119, reportGroup: "Kas", cashAccountType: "cash" },
  bank: { min: 1121, max: 1129, reportGroup: "Bank", cashAccountType: "bank" },
  qris: { min: 1130, max: 1139, reportGroup: "Bank", cashAccountType: "qris" },
  ewallet: { min: 1140, max: 1149, reportGroup: "Bank", cashAccountType: null },
};

export async function listAccounts(
  db: D1Database,
  organizationId: string,
  filters: AccountFilters = {},
): Promise<PublicAccount[]> {
  const conditions = ["organization_id = ?"];
  const values: (string | number)[] = [organizationId];

  if (filters.active !== undefined) {
    conditions.push("is_active = ?");
    values.push(filters.active ? 1 : 0);
  }

  if (filters.cashBankOnly) {
    conditions.push("is_cash_account = 1");
  }

  if (filters.accountTypes?.length) {
    conditions.push(
      `account_type IN (${filters.accountTypes.map(() => "?").join(", ")})`,
    );
    values.push(...filters.accountTypes);
  }

  const rows = await queryAll<AccountRow>(
    db,
    `${accountSelectSql()}
     WHERE ${conditions.join(" AND ")}
     ORDER BY CAST(code AS INTEGER), name`,
    values,
  );

  return rows.map(toPublicAccount);
}

export async function getAccount(
  db: D1Database,
  organizationId: string,
  accountId: string,
): Promise<PublicAccount> {
  const row = await getAccountRow(db, organizationId, accountId);
  if (!row) throw notFound("account_not_found", "Account not found");
  return toPublicAccount(row);
}

export async function generateCashBankCode(
  db: D1Database,
  organizationId: string,
  kind: CashBankKind,
): Promise<number> {
  const range = CASH_BANK_RANGES[kind];
  const rows = await queryAll<UsedCodeRow>(
    db,
    `SELECT CAST(code AS INTEGER) AS code
     FROM accounts
     WHERE organization_id = ?
       AND CAST(code AS INTEGER) BETWEEN ? AND ?
     ORDER BY CAST(code AS INTEGER)`,
    [organizationId, range.min, range.max],
  );
  const code = nextCashBankCode(rows.map((row) => row.code), kind);
  if (!code) {
    throw conflict("account_code_range_full", "No account code is available for this account type");
  }
  return code;
}

async function getAccountByIdempotencyKey(
  db: D1Database,
  organizationId: string,
  idempotencyKey: string,
): Promise<PublicAccount | null> {
  const row = await queryFirst<AccountRow>(
    db,
    `SELECT * FROM accounts WHERE organization_id = ? AND idempotency_key = ?`,
    [organizationId, idempotencyKey],
  );
  return row ? toPublicAccount(row) : null;
}

export async function createCashBankAccount(
  db: D1Database,
  organizationId: string,
  userId: string,
  kind: CashBankKind,
  nameInput: string,
  requestId?: string,
  idempotencyKey?: string,
): Promise<PublicAccount> {
  if (idempotencyKey) {
    const existing = await getAccountByIdempotencyKey(db, organizationId, idempotencyKey);
    if (existing) return existing;
  }

  const name = normalizeAccountName(nameInput);
  await ensureUniqueAccountName(db, organizationId, name);

  const range = CASH_BANK_RANGES[kind];
  const code = await generateCashBankCode(db, organizationId, kind);
  const current = Date.now();
  const accountId = generateId();

  await execute(
    db,
    `INSERT INTO accounts (
       id, organization_id, code, name, account_type, normal_balance,
       is_system, is_locked, is_active, is_cash_account, cash_account_type,
       report_group, idempotency_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'asset', 'debit', 0, 0, 1, 1, ?, ?, ?, ?, ?)`,
    [
      accountId,
      organizationId,
      String(code),
      name,
      range.cashAccountType,
      range.reportGroup,
      idempotencyKey ?? null,
      current,
      current,
    ],
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "account",
    entityId: accountId,
    action: "create",
    after: { code, name, kind },
    requestId,
    current,
  });

  return getAccount(db, organizationId, accountId);
}

export async function createAccount(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreateAccountInput,
  requestId?: string,
): Promise<PublicAccount> {
  if (input.idempotencyKey) {
    const existing = await getAccountByIdempotencyKey(db, organizationId, input.idempotencyKey);
    if (existing) return existing;
  }

  const name = normalizeAccountName(input.name);
  validateAccountType(input.accountType);
  validateNormalBalance(input.normalBalance);
  await ensureUniqueAccountName(db, organizationId, name);

  const code = input.code ?? await nextCodeForAccountType(
    db,
    organizationId,
    input.accountType,
  );
  await ensureUniqueAccountCode(db, organizationId, code);

  const current = Date.now();
  const accountId = generateId();
  await execute(
    db,
    `INSERT INTO accounts (
       id, organization_id, code, name, account_type, normal_balance,
       is_system, is_locked, is_active, is_cash_account, cash_account_type,
       report_group, idempotency_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      organizationId,
      String(code),
      name,
      input.accountType,
      input.normalBalance,
      input.isCashAccount ?? false,
      input.cashAccountType,
      input.reportGroup,
      input.idempotencyKey ?? null,
      current,
      current,
    ],
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "account",
    entityId: accountId,
    action: "create",
    after: { code, name, accountType: input.accountType },
    requestId,
    current,
  });

  return getAccount(db, organizationId, accountId);
}

export async function patchAccount(
  db: D1Database,
  organizationId: string,
  userId: string,
  accountId: string,
  input: PatchAccountInput,
  requestId?: string,
): Promise<PublicAccount> {
  const existing = await getAccountRow(db, organizationId, accountId);
  if (!existing) throw notFound("account_not_found", "Account not found");

  const updates: string[] = [];
  const values: (string | number | boolean)[] = [];
  const before = toPublicAccount(existing);

  if (input.name !== undefined) {
    // ponytail: rename allowed for system/locked accounts (users name their own
    // bank, e.g. BCA/Mandiri). Deletion + deactivation stay protected below.
    const name = normalizeAccountName(input.name);
    await ensureUniqueAccountName(db, organizationId, name, accountId);
    updates.push("name = ?");
    values.push(name);
  }

  if (input.isActive !== undefined) {
    if (existing.is_system || existing.is_locked) {
      throw forbidden("account_protected", "System or locked accounts cannot be deactivated");
    }
    updates.push("is_active = ?");
    values.push(input.isActive);
  }

  if (!updates.length) return before;

  const current = Date.now();
  updates.push("updated_at = ?");
  values.push(current, accountId, organizationId);
  await execute(
    db,
    `UPDATE accounts
     SET ${updates.join(", ")}
     WHERE id = ? AND organization_id = ?`,
    values,
  );

  const after = await getAccount(db, organizationId, accountId);
  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "account",
    entityId: accountId,
    action: "update",
    before,
    after,
    requestId,
    current,
  });

  return after;
}

export async function deleteAccount(
  db: D1Database,
  organizationId: string,
  userId: string,
  accountId: string,
  requestId?: string,
): Promise<void> {
  const existing = await getAccountRow(db, organizationId, accountId);
  if (!existing) throw notFound("account_not_found", "Account not found");
  if (existing.is_system || existing.is_locked) {
    throw forbidden("account_protected", "System or locked accounts cannot be deleted");
  }

  await execute(
    db,
    "DELETE FROM accounts WHERE id = ? AND organization_id = ?",
    [accountId, organizationId],
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "account",
    entityId: accountId,
    action: "delete",
    before: toPublicAccount(existing),
    requestId,
    current: Date.now(),
  });
}

export function nextCashBankCode(
  usedCodes: readonly number[],
  kind: CashBankKind,
): number | null {
  const range = CASH_BANK_RANGES[kind];
  const used = new Set(usedCodes);
  for (let code = range.min; code <= range.max; code += 1) {
    if (!used.has(code)) return code;
  }
  return null;
}

function accountSelectSql(): string {
  return `SELECT
       id,
       CAST(code AS INTEGER) AS code,
       name,
       account_type,
       normal_balance,
       parent_account_id,
       is_system,
       is_locked,
       is_active,
       is_cash_account,
       cash_account_type,
       report_group
     FROM accounts`;
}

async function getAccountRow(
  db: D1Database,
  organizationId: string,
  accountId: string,
): Promise<AccountRow | null> {
  return queryFirst<AccountRow>(
    db,
    `${accountSelectSql()}
     WHERE id = ? AND organization_id = ?`,
    [accountId, organizationId],
  );
}

function toPublicAccount(row: AccountRow): PublicAccount {
  return {
    ...row,
    is_system: row.is_system === 1,
    is_locked: row.is_locked === 1,
    is_active: row.is_active === 1,
    is_cash_account: row.is_cash_account === 1,
  };
}

function normalizeAccountName(nameInput: string): string {
  const name = nameInput.trim();
  if (!name) throw badRequest("account_name_required", "Account name is required");
  if (name.length > 60) {
    throw badRequest("account_name_too_long", "Account name must be at most 60 characters");
  }
  return name;
}

function validateAccountType(accountType: AccountType): void {
  if (!ACCOUNT_TYPE_VALUES.includes(accountType)) {
    throw badRequest("account_type_invalid", "Account type is invalid");
  }
}

function validateNormalBalance(normalBalance: NormalBalance): void {
  if (!NORMAL_BALANCE_VALUES.includes(normalBalance)) {
    throw badRequest("normal_balance_invalid", "Normal balance is invalid");
  }
}

async function ensureUniqueAccountName(
  db: D1Database,
  organizationId: string,
  name: string,
  exceptAccountId?: string,
): Promise<void> {
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id
     FROM accounts
     WHERE organization_id = ?
       AND lower(name) = lower(?)
       ${exceptAccountId ? "AND id != ?" : ""}
     LIMIT 1`,
    exceptAccountId ? [organizationId, name, exceptAccountId] : [organizationId, name],
  );
  if (existing) throw conflict("account_name_duplicate", "Account name is already used");
}

async function ensureUniqueAccountCode(
  db: D1Database,
  organizationId: string,
  code: number,
): Promise<void> {
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id
     FROM accounts
     WHERE organization_id = ?
       AND CAST(code AS INTEGER) = ?
     LIMIT 1`,
    [organizationId, code],
  );
  if (existing) throw conflict("account_code_duplicate", "Account code is already used");
}

async function nextCodeForAccountType(
  db: D1Database,
  organizationId: string,
  accountType: AccountType,
): Promise<number> {
  const [min, max] = accountTypeRange(accountType);
  const rows = await queryAll<UsedCodeRow>(
    db,
    `SELECT CAST(code AS INTEGER) AS code
     FROM accounts
     WHERE organization_id = ?
       AND CAST(code AS INTEGER) BETWEEN ? AND ?
     ORDER BY CAST(code AS INTEGER)`,
    [organizationId, min, max],
  );
  const used = new Set(rows.map((row) => row.code));
  for (let code = min; code <= max; code += 10) {
    if (!used.has(code)) return code;
  }
  throw conflict("account_code_range_full", "No account code is available for this account type");
}

function accountTypeRange(accountType: AccountType): [number, number] {
  switch (accountType) {
    case "asset": return [1190, 1990];
    case "liability": return [2190, 2990];
    case "equity": return [3390, 3990];
    case "revenue": return [4300, 4990];
    case "cogs": return [5200, 5990];
    case "expense": return [6200, 6990];
    case "other_income": return [7200, 7990];
    case "other_expense": return [8200, 8990];
  }
}

