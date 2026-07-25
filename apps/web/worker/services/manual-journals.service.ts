// P3.2 Manual and Adjusting Journals
// Supports general journals, adjusting journals, reversing journals,
// closing journals (zero out revenue/expense to retained earnings),
// and reusable journal templates.

import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst, statement, type D1Input } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { normalizeDate } from "../http/date";
import { badRequest, conflict, notFound } from "../http/errors";
import { requireApprovalOrContinue } from "./approvals.service";
import type { ApprovalRequest } from "./approvals.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JournalEntryType = "normal" | "opening_balance" | "adjustment" | "reversal" | "closing" | "manual_journal";

export interface JournalLineInput {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  description: string;
  partyId?: string | null;
}

export interface PostManualJournalInput {
  entryDate: string;
  entryType: JournalEntryType;
  description: string;
  lines: JournalLineInput[];
  idempotencyKey: string;
  /** If set, links this journal to this original (for reversing entries) */
  reversedEntryId?: string | null;
  reversalReason?: string | null;
}

export interface ManualJournalResult {
  journalEntryId: string;
  entryNumber: string;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface PreviewManualJournalResult {
  entryType: JournalEntryType;
  entryDate: string;
  description: string;
  lines: (JournalLineInput & { accountName: string; accountCode: string })[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface JournalTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  entryType: JournalEntryType;
  lines: JournalLineInput[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface SaveTemplateInput {
  name: string;
  description?: string;
  entryType: JournalEntryType;
  lines: JournalLineInput[];
}

const ENTRY_TYPE_LABELS: Record<JournalEntryType, string> = {
  normal: "Normal",
  opening_balance: "Saldo Awal",
  adjustment: "Jurnal Penyesuaian",
  reversal: "Jurnal Pembalik",
  closing: "Jurnal Penutup",
  manual_journal: "Jurnal Manual",
};

export function entryTypeLabel(type: JournalEntryType): string {
  return ENTRY_TYPE_LABELS[type] ?? type;
}

// ---------------------------------------------------------------------------
// Journal Posting
// ---------------------------------------------------------------------------

/**
 * Preview a manual journal entry without posting.
 * Resolves account names and validates balance.
 */
export async function previewManualJournal(
  db: D1Database,
  organizationId: string,
  input: PostManualJournalInput,
): Promise<PreviewManualJournalResult> {
  const entryDate = normalizeDate(input.entryDate, "entry_date_invalid");
  const description = input.description.trim();
  if (!description) throw badRequest("description_required", "Description is required");

  const lines: PreviewManualJournalResult["lines"] = [];

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const account = await getAccount(db, organizationId, line.accountId);
    if (!account) throw badRequest("account_not_found", `Account not found at line ${i + 1}`);
    if (line.debitMinor <= 0 && line.creditMinor <= 0) {
      throw badRequest("line_zero", `Line ${i + 1}: debit and credit cannot both be zero`);
    }
    if (line.debitMinor > 0 && line.creditMinor > 0) {
      throw badRequest("line_both", `Line ${i + 1}: debit and credit cannot both be greater than zero`);
    }
    lines.push({
      accountId: line.accountId,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      description: line.description || description,
      accountName: account.name,
      accountCode: account.code,
    });
  }

  const totalDebit = lines.reduce((s, l) => s + l.debitMinor, 0);
  const totalCredit = lines.reduce((s, l) => s + l.creditMinor, 0);
  const balanced = totalDebit > 0 && totalCredit > 0 && totalDebit === totalCredit;

  return {
    entryType: input.entryType,
    entryDate,
    description,
    lines,
    totalDebit,
    totalCredit,
    balanced,
  };
}

/**
 * Post a manual journal entry. Supports all journal types:
 * - manual_journal: General journal entry
 * - adjustment: Adjusting journal
 * - closing: Closing journal (zero out revenue/expense)
 * - reversal: Reversing entry
 *
 * For 'closing' entries, the lines should close revenue/expense accounts
 * to retained earnings (the service does NOT auto-generate those lines).
 */
export async function postManualJournal(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: PostManualJournalInput,
  requestId?: string,
): Promise<ManualJournalResult> {
  // Normalize input
  const entryDate = normalizeDate(input.entryDate, "entry_date_invalid");
  const description = input.description.trim();
  if (!description) throw badRequest("description_required", "Description is required");
  if (!input.lines || input.lines.length < 2) {
    throw badRequest("lines_minimum", "At least 2 journal lines are required");
  }

  // Check period is open
  await assertPeriodOpen(db, organizationId, entryDate);

  // Check if approval is needed for manual journals
  const totalMinor = input.lines.reduce((s, l) => s + l.debitMinor, 0);
  const approval = await requireApprovalOrContinue(
    db, organizationId, userId, "manual_journal", "journal_entry", "pending", totalMinor,
    { entitySummary: `${entryTypeLabel(input.entryType)}: ${description}` },
  );
  if (approval) {
    throw badRequest("approval_required",
      `This journal entry requires approval. Request ID: ${approval.id}. Please wait for an admin to approve it.`,
    );
  }

  // Preview to validate
  const preview = await previewManualJournal(db, organizationId, input);

  // Check balance
  if (!preview.balanced) {
    throw badRequest("journal_unbalanced",
      `Journal is not balanced: debit ${preview.totalDebit} ≠ credit ${preview.totalCredit}`,
    );
  }

  const current = Date.now();
  const journalEntryId = generateId();
  const entryNumber = await generateEntryNumber(db, organizationId);

  const statements: D1PreparedStatement[] = [];

  // Insert journal entry
  statements.push(
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, entry_number, entry_date, entry_type,
         description, status, posted_at, posted_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?)`,
      [journalEntryId, organizationId, entryNumber, entryDate, input.entryType, description, current, userId, current],
    ),
  );

  // Insert journal lines
  for (let i = 0; i < preview.lines.length; i++) {
    const line = preview.lines[i];
    statements.push(
      statement(
        db,
        `INSERT INTO journal_lines (
           id, organization_id, journal_entry_id, account_id, party_id,
           debit_minor, credit_minor, description, line_order, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(), organizationId, journalEntryId, line.accountId,
          input.lines[i].partyId ?? null,
          line.debitMinor, line.creditMinor, line.description, i + 1, current,
        ],
      ),
    );
  }

  // Audit log
  statements.push(
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "journal_entry",
      entityId: journalEntryId,
      action: "post",
      after: {
        entry_type: input.entryType,
        entry_number: entryNumber,
        entry_date: entryDate,
        total_debit: preview.totalDebit,
        total_credit: preview.totalCredit,
        line_count: preview.lines.length,
      },
      requestId,
      current,
    }),
  );

  await executeBatch(db, statements);

  return {
    journalEntryId,
    entryNumber,
    totalDebit: preview.totalDebit,
    totalCredit: preview.totalCredit,
    balanced: true,
  };
}

// ---------------------------------------------------------------------------
// Closing Journal Helper
// ---------------------------------------------------------------------------

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  balance: number; // positive = debit balance, negative = credit balance
}

/**
 * Generate closing journal lines for revenue and expense accounts.
 * Revenue (credit-normal) → debit to zero, credit to retained earnings
 * Expense (debit-normal) → credit to zero, debit to retained earnings
 * Net profit accounts → zero to retained earnings
 */
export async function generateClosingJournalLines(
  db: D1Database,
  organizationId: string,
  closingDate: string,
): Promise<{ lines: JournalLineInput[]; totals: { revenue: number; expense: number; netIncome: number } }> {
  // Get account balances for revenue, expense, cogs, other_income, other_expense
  const balances = await queryAll<AccountBalance>(
    db,
    `SELECT a.id, a.code, a.name, a.account_type as accountType, a.normal_balance as normalBalance,
       COALESCE(SUM(
         CASE WHEN a.normal_balance = 'debit' THEN jl.debit_minor - jl.credit_minor
              ELSE jl.credit_minor - jl.debit_minor
         END
       ), 0) as balance
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.organization_id = a.organization_id
     LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     WHERE a.organization_id = ?
       AND a.account_type IN ('revenue', 'cogs', 'expense', 'other_income', 'other_expense')
       AND (je.id IS NULL OR (je.status = 'posted' AND je.entry_date <= ?))
     GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
     HAVING balance != 0
     ORDER BY a.code`,
    [organizationId, closingDate],
  );

  const lines: JournalLineInput[] = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  // Find retained earnings account (code 3400)
  const retainedEarnings = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM accounts WHERE organization_id = ? AND code = '3400' AND is_active = 1`,
    [organizationId],
  );
  if (!retainedEarnings) {
    throw badRequest("retained_earnings_not_found", "Retained earnings account (3400) not found");
  }

  for (const acct of balances) {
    const isRevenue = acct.accountType === "revenue" || acct.accountType === "other_income";
    const isExpense = acct.accountType === "expense" || acct.accountType === "cogs" || acct.accountType === "other_expense";
    const absBalance = Math.abs(acct.balance);

    if (absBalance === 0) continue;

    if (isRevenue) {
      // Revenue has credit normal balance - debit to zero it
      lines.push({ accountId: acct.id, debitMinor: absBalance, creditMinor: 0, description: `Menutup ${acct.name}` });
      // Credit retained earnings
      lines.push({ accountId: retainedEarnings.id, debitMinor: 0, creditMinor: absBalance, description: `Menutup ${acct.name} ke Saldo Laba` });
      totalRevenue += absBalance;
    } else if (isExpense) {
      // Expense has debit normal balance - credit to zero it
      lines.push({ accountId: acct.id, debitMinor: 0, creditMinor: absBalance, description: `Menutup ${acct.name}` });
      // Debit retained earnings
      lines.push({ accountId: retainedEarnings.id, debitMinor: absBalance, creditMinor: 0, description: `Menutup ${acct.name} ke Saldo Laba` });
      totalExpense += absBalance;
    }
  }

  const netIncome = totalRevenue - totalExpense;

  return { lines, totals: { revenue: totalRevenue, expense: totalExpense, netIncome } };
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function listJournalTemplates(
  db: D1Database,
  organizationId: string,
  entryType?: JournalEntryType,
): Promise<JournalTemplate[]> {
  let sql = `SELECT * FROM journal_templates WHERE organization_id = ?`;
  const values: D1Input[] = [organizationId];

  if (entryType) {
    sql += ` AND entry_type = ?`;
    values.push(entryType);
  }
  sql += ` ORDER BY name ASC`;

  const rows = await queryAll<Record<string, unknown>>(db, sql, values);
  return rows.map(toTemplate);
}

export async function getJournalTemplate(
  db: D1Database,
  organizationId: string,
  templateId: string,
): Promise<JournalTemplate> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM journal_templates WHERE id = ? AND organization_id = ?`,
    [templateId, organizationId],
  );
  if (!row) throw notFound("template_not_found", "Journal template not found");
  return toTemplate(row);
}

export async function saveJournalTemplate(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: SaveTemplateInput,
): Promise<JournalTemplate> {
  const id = generateId();
  const now = Date.now();
  const name = input.name.trim();
  if (!name) throw badRequest("name_required", "Template name is required");

  const totalDebit = input.lines.reduce((s, l) => s + l.debitMinor, 0);
  const totalCredit = input.lines.reduce((s, l) => s + l.creditMinor, 0);
  if (totalDebit !== totalCredit) {
    throw badRequest("template_unbalanced", "Template lines must be balanced (debit = credit)");
  }

  const linesJson = JSON.stringify(input.lines.map(l => ({
    account_id: l.accountId,
    debit_minor: l.debitMinor,
    credit_minor: l.creditMinor,
    description: l.description,
    party_id: l.partyId ?? null,
  })));

  await execute(
    db,
    `INSERT INTO journal_templates (
       id, organization_id, name, description, entry_type,
       lines_json, total_debit_minor, total_credit_minor,
       created_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, organizationId, name, input.description ?? "", input.entryType, linesJson, totalDebit, totalCredit, userId, now, now],
  );

  return getJournalTemplate(db, organizationId, id);
}

export async function deleteJournalTemplate(
  db: D1Database,
  organizationId: string,
  templateId: string,
): Promise<void> {
  const result = await execute(
    db,
    `DELETE FROM journal_templates WHERE id = ? AND organization_id = ?`,
    [templateId, organizationId],
  );
  if (result.meta.changes === 0) {
    throw notFound("template_not_found", "Journal template not found");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AccountBrief {
  id: string;
  code: string;
  name: string;
}

async function getAccount(db: D1Database, organizationId: string, accountId: string): Promise<AccountBrief | null> {
  return queryFirst<AccountBrief>(
    db,
    `SELECT id, code, name FROM accounts WHERE id = ? AND organization_id = ? AND is_active = 1`,
    [accountId, organizationId],
  );
}

async function assertPeriodOpen(db: D1Database, organizationId: string, date: string): Promise<void> {
  const lock = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM period_locks
     WHERE organization_id = ? AND locked_through_date >= ?
     ORDER BY locked_through_date DESC LIMIT 1`,
    [organizationId, date],
  );
  if (lock) throw conflict("period_locked", "The selected date is inside a locked period");
}

async function generateEntryNumber(db: D1Database, organizationId: string): Promise<string> {
  const next = await queryFirst<{ current_value: number }>(
    db,
    `SELECT current_value FROM organization_document_counters
     WHERE organization_id = ? AND counter_name = 'entry_number'`,
    [organizationId],
  );
  const nextVal = (next?.current_value ?? 999) + 1;
  await execute(
    db,
    `INSERT OR REPLACE INTO organization_document_counters (organization_id, counter_name, current_value, updated_at)
     VALUES (?, 'entry_number', ?, ?)`,
    [organizationId, nextVal, Date.now()],
  );
  return `JM-${String(nextVal).padStart(6, "0")}`;
}

function toTemplate(row: Record<string, unknown>): JournalTemplate {
  let lines: JournalLineInput[] = [];
  if (typeof row.lines_json === "string") {
    try {
      const raw = JSON.parse(row.lines_json as string) as Array<{
        account_id: string;
        debit_minor: number;
        credit_minor: number;
        description: string;
        party_id: string | null;
      }>;
      lines = raw.map(r => ({
        accountId: r.account_id,
        debitMinor: r.debit_minor,
        creditMinor: r.credit_minor,
        description: r.description,
        partyId: r.party_id ?? null,
      }));
    } catch { lines = []; }
  }

  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    description: row.description as string ?? "",
    entryType: row.entry_type as JournalEntryType,
    lines,
    totalDebitMinor: row.total_debit_minor as number,
    totalCreditMinor: row.total_credit_minor as number,
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
