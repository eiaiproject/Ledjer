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
): Promise<{ statementId: string; importedLines: number }> {
  if (input.lines.length === 0) throw badRequest("empty_statement", "Tidak ada transaksi dalam statement");

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

  return { statementId, importedLines: input.lines.length };
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
  const lastDate = lines.length > 0 ? lines[lines.length - 1].line_date : "1970-01-01";

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
  difference: number | null;
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

  return {
    statement: stmt,
    bankLinesTotal,
    matchedLines: matched,
    unmatchedLines: bankLinesTotal - matched,
    bookBalance: null, // ponytail: book balance query requires period-end aggregation
    statementBalance: (stmt as { closing_balance: number }).closing_balance,
    difference: null,
  };
}
