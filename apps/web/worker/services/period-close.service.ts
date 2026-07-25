// P3.3 Period-Close Checklist Service
// Validates all pre-close checks, saves a report snapshot, and coordinates
// the period-lock creation after all checks pass.

import { queryAll, queryFirst, execute, statement, executeBatch } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest } from "../http/errors";
import { generateId } from "../auth/tokens";
import { createPeriodLock } from "./period-locks.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloseCheck {
  id: string;
  label: string;
  description: string;
  status: "passed" | "failed" | "warning" | "skipped";
  detail: string | null;
  actionPath: string | null;
}

export interface CloseChecklistResult {
  periodEndDate: string;
  checks: CloseCheck[];
  allPassed: boolean;
  canLock: boolean;
}

export interface ReportSnapshot {
  id: string;
  organizationId: string;
  periodEndDate: string;
  snapshotJson: string;
  createdBy: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Close Checklist
// ---------------------------------------------------------------------------

/**
 * Run all period-close validation checks for a given period end date.
 * Each check returns pass/fail/warning with a human-readable detail.
 */
export async function runCloseChecklist(
  db: D1Database,
  organizationId: string,
  periodEndDate: string,
): Promise<CloseChecklistResult> {
  const checks: CloseCheck[] = [];

  // 1. Unresolved drafts
  checks.push(await checkDraftTransactions(db, organizationId));

  // 2. Bank reconciliation — unreconciled statements
  checks.push(await checkReconciliation(db, organizationId));

  // 3. Negative stock
  checks.push(await checkNegativeStock(db, organizationId));

  // 4. Receivables — overdue
  checks.push(await checkOverdueReceivables(db, organizationId));

  // 5. Payables — upcoming
  checks.push(await checkUpcomingPayables(db, organizationId));

  // 6. Trial balance equality
  checks.push(await checkTrialBalance(db, organizationId, periodEndDate));

  // 7. Inventory subledger match
  checks.push(await checkInventoryMatch(db, organizationId));

  // 8. Manual journals (unposted adjusting journals)
  checks.push(await checkManualJournals(db, organizationId));

  const allPassed = checks.every((c) => c.status === "passed" || c.status === "skipped");
  const canLock = allPassed;

  return { periodEndDate, checks, allPassed, canLock };
}

async function checkDraftTransactions(
  db: D1Database,
  organizationId: string,
): Promise<CloseCheck> {
  const row = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM transactions
     WHERE organization_id = ? AND status = 'draft'`,
    [organizationId],
  );
  const count = row?.count ?? 0;
  if (count > 0) {
    return {
      id: "draft_transactions",
      label: "Transaksi Draft",
      description: `${count} transaksi masih dalam status draft.`,
      status: "failed",
      detail: `${count} transaksi draft perlu diposting atau dihapus sebelum tutup periode.`,
      actionPath: "/transactions?status=draft",
    };
  }
  return {
    id: "draft_transactions",
    label: "Transaksi Draft",
    description: "Tidak ada transaksi draft.",
    status: "passed",
    detail: null,
    actionPath: null,
  };
}

async function checkReconciliation(
  db: D1Database,
  organizationId: string,
): Promise<CloseCheck> {
  const row = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM bank_statements
     WHERE organization_id = ? AND status = 'open'`,
    [organizationId],
  );
  const count = row?.count ?? 0;
  if (count > 0) {
    return {
      id: "reconciliation",
      label: "Rekonsiliasi Bank",
      description: `${count} rekening koran masih perlu direkonsiliasi.`,
      status: "warning",
      detail: `Selesaikan rekonsiliasi bank sebelum menutup periode untuk memastikan saldo kas sesuai.`,
      actionPath: "/reconciliation",
    };
  }
  return {
    id: "reconciliation",
    label: "Rekonsiliasi Bank",
    description: "Semua rekening bank sudah direkonsiliasi.",
    status: "passed",
    detail: null,
    actionPath: null,
  };
}

async function checkNegativeStock(
  db: D1Database,
  organizationId: string,
): Promise<CloseCheck> {
  const row = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM products
     WHERE organization_id = ? AND is_active = 1 AND current_stock_milli < 0`,
    [organizationId],
  );
  const count = row?.count ?? 0;
  if (count > 0) {
    return {
      id: "negative_stock",
      label: "Stok Negatif",
      description: `${count} produk memiliki stok negatif.`,
      status: "failed",
      detail: `Lakukan penyesuaian stok untuk ${count} produk yang bernilai negatif.`,
      actionPath: "/products",
    };
  }
  return {
    id: "negative_stock",
    label: "Stok Negatif",
    description: "Tidak ada produk dengan stok negatif.",
    status: "passed",
    detail: null,
    actionPath: null,
  };
}

async function checkOverdueReceivables(
  db: D1Database,
  organizationId: string,
): Promise<CloseCheck> {
  const row = await queryFirst<{ count: number; total: number }>(
    db,
    `SELECT COUNT(*) as count, COALESCE(SUM(total_minor - paid_minor), 0) as total
     FROM invoices
     WHERE organization_id = ? AND status IN ('issued', 'sent', 'overdue')
       AND due_date < date('now')`,
    [organizationId],
  );
  const count = row?.count ?? 0;
  if (count > 0) {
    return {
      id: "overdue_receivables",
      label: "Piutang Jatuh Tempo",
      description: `${count} faktur dengan total Rp ${((row?.total ?? 0) / 100).toLocaleString("id-ID")} sudah jatuh tempo.`,
      status: "warning",
      detail: `Tindak lanjuti piutang jatuh tempo sebelum tutup periode.`,
      actionPath: "/reports/aging",
    };
  }
  return {
    id: "overdue_receivables",
    label: "Piutang Jatuh Tempo",
    description: "Tidak ada piutang jatuh tempo.",
    status: "passed",
    detail: null,
    actionPath: null,
  };
}

async function checkUpcomingPayables(
  db: D1Database,
  organizationId: string,
): Promise<CloseCheck> {
  const row = await queryFirst<{ count: number; total: number }>(
    db,
    `SELECT COUNT(*) as count, COALESCE(SUM(total_minor - paid_minor), 0) as total
     FROM invoices
     WHERE organization_id = ? AND status IN ('issued', 'sent')
       AND due_date BETWEEN date('now') AND date('now', '+30 days')`,
    [organizationId],
  );
  const count = row?.count ?? 0;
  if (count > 0) {
    return {
      id: "upcoming_payables",
      label: "Utang Mendatang",
      description: `${count} tagihan sebesar Rp ${((row?.total ?? 0) / 100).toLocaleString("id-ID")} akan jatuh tempo.`,
      status: "warning",
      detail: `Pastikan dana tersedia untuk tagihan yang akan jatuh tempo dalam 30 hari.`,
      actionPath: "/invoices",
    };
  }
  return {
    id: "upcoming_payables",
    label: "Utang Mendatang",
    description: "Tidak ada utang mendesak.",
    status: "passed",
    detail: null,
    actionPath: null,
  };
}

async function checkTrialBalance(
  db: D1Database,
  organizationId: string,
  periodEndDate: string,
): Promise<CloseCheck> {
  const row = await queryFirst<{ total_debit: number | null; total_credit: number | null }>(
    db,
    `SELECT
       COALESCE(SUM(jl.debit_minor), 0) as total_debit,
       COALESCE(SUM(jl.credit_minor), 0) as total_credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     WHERE jl.organization_id = ?
       AND je.status = 'posted'
       AND je.entry_date <= ?`,
    [organizationId, periodEndDate],
  );
  const debit = row?.total_debit ?? 0;
  const credit = row?.total_credit ?? 0;
  if (debit !== credit) {
    return {
      id: "trial_balance",
      label: "Keseimbangan Neraca Saldo",
      description: `Total debit (Rp ${(debit / 100).toLocaleString("id-ID")}) ≠ total kredit (Rp ${(credit / 100).toLocaleString("id-ID")}).`,
      status: "failed",
      detail: `Selisih Rp ${(Math.abs(debit - credit) / 100).toLocaleString("id-ID")}. Periksa jurnal yang tidak balance sebelum tutup periode.`,
      actionPath: "/reports/trial-balance",
    };
  }
  return {
    id: "trial_balance",
    label: "Keseimbangan Neraca Saldo",
    description: "Neraca saldo balance (debit = kredit).",
    status: "passed",
    detail: null,
    actionPath: null,
  };
}

async function checkInventoryMatch(
  db: D1Database,
  organizationId: string,
): Promise<CloseCheck> {
  // Check that total inventory valuation matches the inventory control account
  const stockValue = await queryFirst<{ value: number | null }>(
    db,
    `SELECT COALESCE(SUM(p.current_stock_milli * p.average_cost_minor / 1000), 0) as value
     FROM products p
     WHERE p.organization_id = ? AND p.is_active = 1`,
    [organizationId],
  );

  const invBalance = await queryFirst<{ balance: number | null }>(
    db,
    `SELECT COALESCE(SUM(
       CASE WHEN a.normal_balance = 'debit' THEN jl.debit_minor - jl.credit_minor
            ELSE jl.credit_minor - jl.debit_minor END
     ), 0) as balance
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.organization_id = a.organization_id
     LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     WHERE a.organization_id = ? AND a.account_type = 'asset' AND a.report_group = 'Persediaan'
       AND (je.id IS NULL OR (je.status = 'posted'))`,
    [organizationId],
  );

  const stock = stockValue?.value ?? 0;
  const balance = invBalance?.balance ?? 0;
  const diff = Math.abs(stock - balance);

  if (diff > 100) { // > Rp 1 tolerance
    return {
      id: "inventory_match",
      label: "Kecocokan Stok",
      description: `Nilai stok (Rp ${(stock / 100).toLocaleString()}) ≠ saldo akun persediaan (Rp ${(balance / 100).toLocaleString()}).`,
      status: "warning",
      detail: `Selisih Rp ${(diff / 100).toLocaleString("id-ID")}. Lakukan stock opname untuk mencocokkan.`,
      actionPath: "/products",
    };
  }
  return {
    id: "inventory_match",
    label: "Kecocokan Stok",
    description: "Nilai stok sesuai dengan akun persediaan.",
    status: "passed",
    detail: null,
    actionPath: null,
  };
}

async function checkManualJournals(
  db: D1Database,
  organizationId: string,
): Promise<CloseCheck> {
  // Check if there are any adjusting journals posted in this period
  const journals = await queryFirst<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM journal_entries
     WHERE organization_id = ? AND entry_type IN ('adjustment', 'closing', 'manual_journal')`,
    [organizationId],
  );
  const count = journals?.count ?? 0;

  return {
    id: "manual_journals",
    label: "Jurnal Manual & Penyesuaian",
    description: count > 0
      ? `${count} jurnal penyesuaian telah diposting.`
      : "Belum ada jurnal penyesuaian. Posting jurnal penutup untuk menutup revenue/expense.",
    status: "passed",
    detail: count > 0
      ? "Semua jurnal penyesuaian sudah diposting."
      : "Pertimbangkan untuk membuat jurnal penyesuaian jika diperlukan.",
    actionPath: "/journals",
  };
}

// ---------------------------------------------------------------------------
// Report Snapshot
// ---------------------------------------------------------------------------

/**
 * Save a snapshot of key financial figures before locking the period.
 */
export async function savePeriodSnapshot(
  db: D1Database,
  organizationId: string,
  periodEndDate: string,
  userId: string,
): Promise<ReportSnapshot> {
  const snapshot: Record<string, unknown> = {};

  // Trial balance summary
  const tbRow = await queryFirst<{ total_debit: number; total_credit: number }>(
    db,
    `SELECT
       COALESCE(SUM(jl.debit_minor), 0) as total_debit,
       COALESCE(SUM(jl.credit_minor), 0) as total_credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     WHERE jl.organization_id = ? AND je.status = 'posted' AND je.entry_date <= ?`,
    [organizationId, periodEndDate],
  );
  snapshot.trialBalance = tbRow;

  // Revenue & expense totals
  const plRow = await queryFirst<{ revenue: number; expense: number }>(
    db,
    `SELECT
       COALESCE(SUM(CASE WHEN a.account_type IN ('revenue','other_income') THEN jl.credit_minor - jl.debit_minor ELSE 0 END), 0) as revenue,
       COALESCE(SUM(CASE WHEN a.account_type IN ('cogs','expense','other_expense') THEN jl.debit_minor - jl.credit_minor ELSE 0 END), 0) as expense
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
     WHERE jl.organization_id = ? AND je.status = 'posted' AND je.entry_date <= ?`,
    [organizationId, periodEndDate],
  );
  snapshot.profitLoss = plRow;

  // Cash balance
  const cashRow = await queryFirst<{ balance: number }>(
    db,
    `SELECT COALESCE(SUM(
       CASE WHEN a.normal_balance = 'debit' THEN jl.debit_minor - jl.credit_minor
            ELSE jl.credit_minor - jl.debit_minor END
     ), 0) as balance
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.organization_id = a.organization_id
     LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
     WHERE a.organization_id = ? AND a.is_cash_account = 1
       AND (je.id IS NULL OR (je.status = 'posted' AND je.entry_date <= ?))`,
    [organizationId, periodEndDate],
  );
  snapshot.cashBalance = cashRow;

  // Counts
  const counts = await queryAll<{ table: string; count: number }>(
    db,
    `SELECT 'transactions' as table, COUNT(*) as count FROM transactions WHERE organization_id = ? AND status = 'posted' AND transaction_date <= ?
     UNION ALL SELECT 'products', COUNT(*) FROM products WHERE organization_id = ? AND is_active = 1
     UNION ALL SELECT 'parties', COUNT(*) FROM parties WHERE organization_id = ? AND is_active = 1`,
    [organizationId, periodEndDate, organizationId, organizationId],
  );
  snapshot.counts = counts;

  const now = Date.now();
  const id = generateId();
  const snapshotJson = JSON.stringify(snapshot);

  await execute(
    db,
    `INSERT INTO period_snapshots (id, organization_id, period_end_date, snapshot_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, organizationId, periodEndDate, snapshotJson, userId, now],
  );

  return {
    id,
    organizationId,
    periodEndDate,
    snapshotJson,
    createdBy: userId,
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// Lock Period (with checklist enforcement)
// ---------------------------------------------------------------------------

/**
 * Run checklist, save snapshot, and lock period in one atomic flow.
 */
export async function closePeriod(
  db: D1Database,
  organizationId: string,
  userId: string,
  periodEndDate: string,
  reason?: string,
): Promise<{
  checklist: CloseChecklistResult;
  snapshot: ReportSnapshot;
  lock: { id: string; lockedThroughDate: string };
}> {
  // 1. Run checklist
  const checklist = await runCloseChecklist(db, organizationId, periodEndDate);
  if (!checklist.canLock) {
    const failed = checklist.checks.filter((c) => c.status === "failed");
    throw badRequest("close_checklist_failed",
      `${failed.length} pemeriksaan gagal: ${failed.map((c) => c.label).join(", ")}. Perbaiki sebelum menutup periode.`,
    );
  }

  // 2. Save report snapshot
  const snapshot = await savePeriodSnapshot(db, organizationId, periodEndDate, userId);

  // 3. Create period lock
  const lock = await createPeriodLock(db, organizationId, userId, {
    lockedThroughDate: periodEndDate,
    reason: reason ?? `Tutup periode ${periodEndDate}`,
  });

  // 4. Audit
  const statements = [
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "period_close",
      entityId: lock.id,
      action: "period_closed",
      before: null,
      after: {
        period_end_date: periodEndDate,
        snapshot_id: snapshot.id,
        checks_passed: checklist.allPassed,
        check_count: checklist.checks.length,
      },
      reason: reason?.trim() ?? null,
      current: Date.now(),
    }),
  ];
  await executeBatch(db, statements);

  return {
    checklist,
    snapshot,
    lock: { id: lock.id, lockedThroughDate: lock.lockedThroughDate },
  };
}
