// ponytail: Bank reconciliation MVP. Imports CSV, matches by exact amount + date
// proximity. Manual match and report endpoints. Upgrade: fuzzy matching by
// description, auto-suggest split matches, OFX/QFX import.

import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst } from "../db/client";
import { badRequest, notFound } from "../http/errors";

export interface StatementImport {
  accountId: string;
  statementDate: string;
  openingBalance: number;
  closingBalance: number;
  fileName: string;
  lines: { date: string; description: string; amount: number; balance?: number; reference?: string }[];
}

export interface StatementLine {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  reference: string | null;
}

export interface MatchSuggestion {
  statementLineId: string;
  transactionId: string | null;
  transactionDate: string | null;
  transactionDesc: string | null;
  amount: number;
  score: number; // 0-100 confidence
}

export async function importStatement(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: StatementImport,
): Promise<{ statementId: string; importedLines: number; duplicatedLines?: { line: number; reason: string }[]; warnings?: string[] }> {
  if (input.lines.length === 0) throw badRequest("empty_statement", "Tidak ada transaksi dalam statement");

  const warnings: string[] = [];
  const duplicatedLines: { line: number; reason: string }[] = [];

  // --- Duplicate detection: check for existing statement with same account + date ---
  const existing = await queryFirst<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM bank_statements
     WHERE organization_id = ? AND account_id = ? AND statement_date = ? AND status = 'open'`,
    [organizationId, input.accountId, input.statementDate],
  );
  if (existing) {
    warnings.push(
      `Statement untuk akun ini pada tanggal ${input.statementDate} sudah pernah diimport (status: ${existing.status}). Import baru akan membuat statement terpisah.`
    );
  }

  // Check if another statement with same closing balance already exists
  const sameBalance = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM bank_statements
     WHERE organization_id = ? AND account_id = ? AND closing_balance = ? AND status = 'reconciled'`,
    [organizationId, input.accountId, input.closingBalance],
  );
  if (sameBalance) {
    warnings.push(
      `Saldo akhir Rp ${(input.closingBalance / 100).toLocaleString("id-ID")} sudah pernah direkonsiliasi sebelumnya. Periksa apakah ini duplikat.`
    );
  }

  // --- Duplicate line detection ---
  const seenEntries = new Map<string, number[]>();
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const key = `${line.date}|${line.amount}|${line.description.trim().toLowerCase()}`;
    if (seenEntries.has(key)) {
      seenEntries.get(key)!.push(i + 1);
    } else {
      seenEntries.set(key, [i + 1]);
    }
  }
  for (const [, lineNums] of seenEntries) {
    if (lineNums.length > 1) {
      duplicatedLines.push({
        line: lineNums[0],
        reason: `Baris ${lineNums.join(", ")} memiliki tanggal, jumlah, dan deskripsi yang sama — kemungkinan duplikat.`,
      });
    }
  }

  const statementId = generateId();
  const now = Date.now();

  const statements: D1PreparedStatement[] = [];

  // Insert statement header
  statements.push(
    db.prepare(
      `INSERT INTO bank_statements (id, organization_id, account_id, statement_date, opening_balance, closing_balance, file_name, status, imported_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    ).bind(statementId, organizationId, input.accountId, input.statementDate,
      input.openingBalance, input.closingBalance, input.fileName, userId, now, now),
  );

  // Insert lines
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    statements.push(
      db.prepare(
        `INSERT INTO bank_statement_lines (id, organization_id, statement_id, line_date, description, amount_minor, balance_after_minor, reference, line_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(generateId(), organizationId, statementId, line.date, line.description,
        line.amount, line.balance ?? null, line.reference ?? null, i + 1, now),
    );
  }

  await executeBatch(db, statements);

  return {
    statementId,
    importedLines: input.lines.length,
    duplicatedLines: duplicatedLines.length > 0 ? duplicatedLines : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export async function getSuggestions(
  db: D1Database,
  organizationId: string,
  statementId: string,
): Promise<MatchSuggestion[]> {
  // Get the statement to find the account
  const stmt = await queryFirst<{ account_id: string }>(
    db,
    `SELECT account_id FROM bank_statements WHERE id = ? AND organization_id = ?`,
    [statementId, organizationId],
  );
  if (!stmt) throw notFound("statement_not_found", "Statement tidak ditemukan");

  // Get unmatched statement lines
  const lines = await queryAll<{ id: string; line_date: string; description: string; amount_minor: number }>(
    db,
    `SELECT bsl.id, bsl.line_date, bsl.description, bsl.amount_minor
     FROM bank_statement_lines bsl
     LEFT JOIN reconciliation_matches rm ON rm.statement_line_id = bsl.id
     WHERE bsl.statement_id = ? AND bsl.organization_id = ? AND rm.id IS NULL
     ORDER BY bsl.line_order`,
    [statementId, organizationId],
  );

  // Get recent transactions on the same cash account within a window
  const firstDate = lines.length > 0 ? lines[0].line_date : "1970-01-01";
  const lastDate = lines.length > 0 ? lines.at(-1)!.line_date : "1970-01-01";

  const transactions = await queryAll<{
    id: string; transaction_date: string; transaction_type: string;
    amount_minor: number; description: string;
  }>(
    db,
    `SELECT t.id, t.transaction_date, t.transaction_type, t.amount_minor, t.description
     FROM transactions t
     WHERE t.organization_id = ?
       AND t.cash_account_id = ?
       AND t.status = 'posted'
       AND t.transaction_date BETWEEN ? AND ?
     ORDER BY t.transaction_date`,
    [organizationId, stmt.account_id, firstDate, lastDate],
  );

  // Match by exact amount
  const suggestions: MatchSuggestion[] = [];
  for (const line of lines) {
    const absAmount = Math.abs(line.amount_minor);
    const best = transactions
      .filter((tx) => Math.abs(tx.amount_minor) === absAmount)
      .sort((a, b) => {
        // Prefer same date
        const aSameDate = a.transaction_date === line.line_date ? 1 : 0;
        const bSameDate = b.transaction_date === line.line_date ? 1 : 0;
        return bSameDate - aSameDate;
      });

    if (best.length > 0) {
      const tx = best[0];
      const dateMatch = tx.transaction_date === line.line_date;
      suggestions.push({
        statementLineId: line.id,
        transactionId: tx.id,
        transactionDate: tx.transaction_date,
        transactionDesc: tx.description || tx.transaction_type,
        amount: line.amount_minor,
        score: dateMatch ? 95 : 70,
      });
    } else {
      // No match found — bank-only item
      suggestions.push({
        statementLineId: line.id,
        transactionId: null,
        transactionDate: null,
        transactionDesc: null,
        amount: line.amount_minor,
        score: 0,
      });
    }
  }

  return suggestions;
}

export async function confirmMatch(
  db: D1Database,
  organizationId: string,
  userId: string,
  statementId: string,
  matches: { statementLineId: string; transactionId: string | null }[],
): Promise<{ matched: number }> {
  const now = Date.now();
  let matched = 0;

  for (const m of matches) {
    // Check statement line belongs to this org/statement
    const line = await queryFirst<{ id: string }>(
      db,
      `SELECT bsl.id FROM bank_statement_lines bsl
       JOIN bank_statements bs ON bs.id = bsl.statement_id
       WHERE bsl.id = ? AND bsl.organization_id = ? AND bsl.statement_id = ?`,
      [m.statementLineId, organizationId, statementId],
    );
    if (!line) continue;

    // Check not already matched
    const existing = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM reconciliation_matches WHERE statement_line_id = ?`,
      [m.statementLineId],
    );
    if (existing) continue;

    await execute(
      db,
      `INSERT INTO reconciliation_matches (id, organization_id, statement_id, statement_line_id, transaction_id, match_type, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', 'matched', ?, ?)`,
      [generateId(), organizationId, statementId, m.statementLineId, m.transactionId, userId, now],
    );
    matched++;
  }

  return { matched };
}

export async function getReconciliationReport(
  db: D1Database,
  organizationId: string,
  statementId: string,
): Promise<{
  statement: Record<string, unknown>;
  bankLinesTotal: number;
  matchedLines: number;
  unmatchedLines: number;
  bookBalance: number | null;
  statementBalance: number;
  openingBalance: number;
  difference: number | null;
  balanced: boolean;
}> {
  const stmt = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT * FROM bank_statements WHERE id = ? AND organization_id = ?`,
    [statementId, organizationId],
  );
  if (!stmt) throw notFound("statement_not_found", "Statement tidak ditemukan");

  const totalLines = await queryFirst<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM bank_statement_lines WHERE statement_id = ?`,
    [statementId],
  );

  const matchedLines = await queryFirst<{ cnt: number }>(
    db,
    `SELECT COUNT(*) as cnt FROM reconciliation_matches WHERE statement_id = ? AND status = 'matched'`,
    [statementId],
  );

  const bankLinesTotal = totalLines?.cnt ?? 0;
  const matched = matchedLines?.cnt ?? 0;
  const stmtData = stmt as { account_id: string; closing_balance: number; opening_balance: number; statement_date: string };

  // --- Balance proof: calculate book balance at statement date ---
  let bookBalance: number | null = null;
  let difference: number | null = null;

  // Get the cash account's beginning balance from journal entries up to statement date
  // Sum all journal line debits and credits for this account up to the statement date
  const balanceRow = await queryFirst<{ net_balance: number }>(
    db,
    `SELECT COALESCE(SUM(
       CASE WHEN jl.debit_minor > 0 THEN jl.debit_minor ELSE -jl.credit_minor END
     ), 0) as net_balance
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.organization_id = ? AND jl.account_id = ?
       AND je.organization_id = ?
       AND je.entry_date <= ?
       AND je.status = 'posted'`,
    [organizationId, stmtData.account_id, organizationId, stmtData.statement_date],
  );

  if (balanceRow) {
    // Book balance = net sum of all journal lines for this account up to statement date
    bookBalance = balanceRow.net_balance ?? 0;
    difference = Math.abs(bookBalance - stmtData.closing_balance);
  }

  return {
    statement: stmt,
    bankLinesTotal,
    matchedLines: matched,
    unmatchedLines: bankLinesTotal - matched,
    bookBalance,
    statementBalance: stmtData.closing_balance,
    openingBalance: stmtData.opening_balance,
    difference,
    balanced: difference === 0,
  };
}

/**
 * Reopen a reconciled statement, setting its status back to 'open'.
 * Requires all existing matches to be voided first.
 */
export async function reopenReconciliation(
  db: D1Database,
  organizationId: string,
  userId: string,
  statementId: string,
  reason?: string,
): Promise<{ success: boolean; message: string }> {
  const stmt = await queryFirst<{ status: string }>(
    db,
    `SELECT status FROM bank_statements WHERE id = ? AND organization_id = ?`,
    [statementId, organizationId],
  );
  if (!stmt) throw notFound("statement_not_found", "Statement tidak ditemukan");
  if (stmt.status !== "reconciled") {
    throw badRequest("not_reconciled",
      `Statement berstatus "${stmt.status}", bukan "reconciled". Hanya statement yang sudah direkonsiliasi yang bisa dibuka ulang.`);
  }

  const now = Date.now();

  // Delete all matches for this statement (they will be re-matched)
  await execute(
    db,
    `DELETE FROM reconciliation_matches WHERE statement_id = ? AND organization_id = ?`,
    [statementId, organizationId],
  );

  // Update statement status back to 'open'
  await execute(
    db,
    `UPDATE bank_statements SET status = 'open', updated_at = ? WHERE id = ?`,
    [now, statementId],
  );

  // Audit log
  await execute(
    db,
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, before_json, after_json, reason, created_at)
     VALUES (?, ?, ?, 'bank_reconciliation', ?, 'reopened', ?, ?, ?, ?)`,
    [generateId(), organizationId, userId, statementId,
     JSON.stringify({ status: 'reconciled' }),
     JSON.stringify({ status: 'open' }),
     reason ?? null, now],
  );

  return {
    success: true,
    message: `Statement berhasil dibuka ulang. Data cocok telah dihapus dan dapat dicocokkan kembali.`,
  };
}
