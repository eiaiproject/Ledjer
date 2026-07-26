import { executeBatch, queryAll, queryFirst } from "../db/client";
import { generateId } from "../auth/tokens";
import type { AccountType, NormalBalance } from "../db/schema";

/** Snapshot of account balances at opening balance posting time. */
export interface OpeningBalanceSnapshot {
  journalEntryId: string;
  entryNumber: string;
  postedAt: number;
  date: string;
  totalDebit: number;
  totalCredit: number;
  accounts: {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: AccountType;
    debit: number;
    credit: number;
  }[];
}


export interface OpeningBalanceLine {
  accountId: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  amount: number; // positive = normal direction, negative = opposite direction
}

export interface OpeningBalancePreview {
  valid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  lines: {
    accountId: string;
    accountName: string;
    accountCode: string;
    debit: number;
    credit: number;
  }[];
  errors: string[];
}

export interface OpeningBalanceInput {
  date: string;
  lines: {
    accountId: string;
    amount: number;
  }[];
}

/**
 * Given an account type and normal balance, compute which side gets the amount.
 */
export function calculateDebitCredit(
  _accountType: AccountType,
  amount: number,
  normalBalance: NormalBalance,
): { debit: number; credit: number } {
  // Normal debit accounts: asset, expense, cogs
  // Normal credit accounts: liability, equity, revenue, other_income, other_expense
  const isDebitNormal = normalBalance === "debit";

  if (amount >= 0) {
    return isDebitNormal
      ? { debit: amount, credit: 0 }
      : { debit: 0, credit: amount };
  }
  // Negative amount → reverse the normal side
  const absVal = Math.abs(amount);
  return isDebitNormal
    ? { debit: 0, credit: absVal }
    : { debit: absVal, credit: 0 };
}

export function validateOpeningBalanceInput(
  lines: OpeningBalanceLine[],
): OpeningBalancePreview {
  const errors: string[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  const previewLines: OpeningBalancePreview["lines"] = [];

  if (lines.length === 0) {
    errors.push("Setidaknya satu akun harus diisi");
  }

  for (const line of lines) {
    if (line.amount === 0) {
      errors.push(`Akun ${line.accountId}: jumlah tidak boleh 0`);
      continue;
    }
    const { debit, credit } = calculateDebitCredit(
      line.accountType,
      line.amount,
      line.normalBalance,
    );
    totalDebit += debit;
    totalCredit += credit;
    previewLines.push({
      accountId: line.accountId,
      accountName: "",
      accountCode: "",
      debit,
      credit,
    });
  }

  const difference = totalDebit - totalCredit;
  if (difference !== 0) {
    errors.push(
      `Total debit (${totalDebit}) tidak sama dengan total kredit (${totalCredit}). Selisih: ${Math.abs(difference)}`,
    );
  }

  return {
    valid: errors.length === 0,
    totalDebit,
    totalCredit,
    difference,
    lines: previewLines,
    errors,
  };
}

export async function previewOpeningBalance(
  db: D1Database,
  organizationId: string,
  input: OpeningBalanceInput,
): Promise<OpeningBalancePreview> {
  // Fetch accounts with their types
  const accountIds = input.lines.map((l) => l.accountId);
  if (accountIds.length === 0) {
    return { valid: false, totalDebit: 0, totalCredit: 0, difference: 0, lines: [], errors: ["Tidak ada akun"] };
  }

  const placeholders = accountIds.map(() => "?").join(",");
  const accounts = await queryAll<{
    id: string;
    code: string;
    name: string;
    account_type: AccountType;
    normal_balance: NormalBalance;
  }>(
    db,
    `SELECT id, code, name, account_type, normal_balance FROM accounts WHERE organization_id = ? AND id IN (${placeholders})`,
    [organizationId, ...accountIds],
  );

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Check for missing accounts
  const errors: string[] = [];
  for (const id of accountIds) {
    if (!accountMap.has(id)) {
      errors.push(`Akun ${id} tidak ditemukan`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, totalDebit: 0, totalCredit: 0, difference: 0, lines: [], errors };
  }

  // Check existing opening balances
  const existingCount = await queryFirst<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = ? AND entry_type = 'opening_balance'`,
    [organizationId],
  );
  if (existingCount && existingCount.cnt > 0) {
    errors.push("Saldo awal sudah pernah diposting. Gunakan jurnal penyesuaian untuk koreksi.");
  }

  const lines: OpeningBalanceLine[] = input.lines.map((l) => {
    const acct = accountMap.get(l.accountId)!;
    return {
      accountId: l.accountId,
      accountType: acct.account_type,
      normalBalance: acct.normal_balance,
      amount: l.amount,
    };
  });

  const preview = validateOpeningBalanceInput(lines);

  // Fill account names/codes
  for (const pl of preview.lines) {
    const acct = accountMap.get(pl.accountId);
    if (acct) {
      pl.accountName = acct.name;
      pl.accountCode = acct.code;
    }
  }

  return preview;
}

export async function postOpeningBalance(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: OpeningBalanceInput,
): Promise<{ journalEntryId: string; totalDebit: number; totalCredit: number; snapshot: OpeningBalanceSnapshot }> {
  const preview = await previewOpeningBalance(db, organizationId, input);
  if (!preview.valid) {
    throw new Error(preview.errors.join("; "));
  }

  // Fetch account details for snapshot (previewOpeningBalance fetches them internally)
  const accountIds = input.lines.map((l) => l.accountId);
  const placeholders = accountIds.map(() => "?").join(",");
  const accounts = await queryAll<{
    id: string; code: string; name: string;
    account_type: AccountType; normal_balance: NormalBalance;
  }>(
    db,
    `SELECT id, code, name, account_type, normal_balance FROM accounts WHERE organization_id = ? AND id IN (${placeholders})`,
    [organizationId, ...accountIds],
  );
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Get next entry number
  const maxEntry = await queryFirst<{ max: string | null }>(
    db,
    `SELECT MAX(entry_number) as max FROM journal_entries WHERE organization_id = ?`,
    [organizationId],
  );
  const nextNum = maxEntry?.max
    ? String(Number.parseInt(maxEntry.max.replace("JE-", ""), 10) + 1).padStart(6, "0")
    : "000001";

  const entryId = generateId();
  const entryNumber = `JE-${nextNum}`;
  const now = Date.now();
  const date = input.date;

  // 1. Insert journal entry
  const insertStatements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO journal_entries (id, organization_id, entry_number, entry_date, entry_type, description, status, posted_at, posted_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'opening_balance', 'Saldo awal', 'posted', ?, ?, ?, ?)`,
    ).bind(entryId, organizationId, entryNumber, date, now, userId, now, now),
  ];

  let lineOrder = 1;
  for (const pl of preview.lines) {
    if (pl.debit > 0 || pl.credit > 0) {
      insertStatements.push(
        db.prepare(
          `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_minor, credit_minor, description, line_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Saldo awal', ?, ?)`,
        ).bind(
          generateId(), organizationId, entryId, pl.accountId,
          pl.debit, pl.credit, lineOrder++, now,
        ),
      );
    }
  }

  // Update onboarding status
  insertStatements.push(
    db.prepare(
      `UPDATE organizations SET onboarding_status = 'completed', updated_at = ? WHERE id = ? AND onboarding_status != 'completed'`,
    ).bind(now, organizationId),
  );

  await executeBatch(db, insertStatements);

  // 2. Build report snapshot with account codes and names
  const snapshot: OpeningBalanceSnapshot = {
    journalEntryId: entryId,
    entryNumber,
    postedAt: now,
    date,
    totalDebit: preview.totalDebit,
    totalCredit: preview.totalCredit,
    accounts: preview.lines
      .filter((pl) => pl.debit > 0 || pl.credit > 0)
      .map((pl) => {
        const acct = accountMap.get(pl.accountId);
        return {
          accountId: pl.accountId,
          accountCode: acct?.code ?? "",
          accountName: acct?.name ?? "",
          accountType: acct?.account_type ?? "asset",
          debit: pl.debit,
          credit: pl.credit,
        };
      }),
  };

  // 3. Store snapshot in audit_logs
  await executeBatch(db, [
    db.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, after_json, created_at)
       VALUES (?, ?, ?, 'opening_balance_snapshot', ?, 'snapshot_created', ?, ?)`,
    ).bind(
      generateId(), organizationId, userId,
      entryId,
      JSON.stringify(snapshot),
      now,
    ),
  ]);

  return { journalEntryId: entryId, totalDebit: preview.totalDebit, totalCredit: preview.totalCredit, snapshot };
}

/** Retrieve the latest opening balance snapshot for an organization. */
export async function getOpeningBalanceSnapshot(
  db: D1Database,
  organizationId: string,
): Promise<OpeningBalanceSnapshot | null> {
  const log = await queryFirst<{ after_json: string }>(
    db,
    `SELECT after_json FROM audit_logs
     WHERE organization_id = ? AND entity_type = 'opening_balance_snapshot' AND action = 'snapshot_created'
     ORDER BY created_at DESC LIMIT 1`,
    [organizationId],
  );
  return log ? (JSON.parse(log.after_json) as OpeningBalanceSnapshot) : null;
}
