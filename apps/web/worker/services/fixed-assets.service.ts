// P3.5 Fixed Assets Service
// Asset register, automatic depreciation, disposal, and book-value reporting.

import { queryAll, queryFirst, execute, executeBatch, statement, type D1Input } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, notFound } from "../http/errors";
import { generateId } from "../auth/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetCategory =
  | "building" | "machinery" | "vehicle" | "office_equipment"
  | "computer" | "furniture" | "land" | "other";

export type DepreciationMethod = "straight_line" | "declining_balance" | "sum_of_years_digits";

export type AssetStatus = "active" | "disposed" | "sold" | "impaired";

export interface FixedAsset {
  id: string;
  organizationId: string;
  assetCode: string;
  assetName: string;
  assetCategory: AssetCategory;
  description: string;
  acquisitionDate: string;
  acquisitionCostMinor: number;
  residualValueMinor: number;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  decliningBalanceRate: number | null;
  accountAssetId: string;
  accountDepreciationId: string;
  accountExpenseId: string;
  status: AssetStatus;
  disposalDate: string | null;
  disposalPriceMinor: number | null;
  disposalReason: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Computed: current book value */
  bookValueMinor?: number;
  /** Computed: accumulated depreciation */
  accumulatedMinor?: number;
  /** Computed: last depreciation period */
  lastDepreciationPeriod?: string | null;
}

export interface AssetDepreciationRow {
  id: string;
  organizationId: string;
  assetId: string;
  period: string;
  expenseMinor: number;
  accumulatedMinor: number;
  bookValueMinor: number;
  journalEntryId: string | null;
  status: "pending" | "posted" | "skipped";
  createdAt: number;
}

export interface BookValueReport {
  assetId: string;
  assetCode: string;
  assetName: string;
  assetCategory: string;
  acquisitionDate: string;
  acquisitionCost: number;
  accumulatedDepreciation: number;
  bookValue: number;
  residualValue: number;
  depreciationMethod: string;
  usefulLifeMonths: number;
  monthsElapsed: number;
  monthlyDepreciation: number;
  status: string;
}

export interface DepreciationRunResult {
  entriesCreated: number;
  entriesSkipped: number;
  errors: string[];
  totalExpense: number;
  period: string;
}

// ---------------------------------------------------------------------------
// Asset CRUD
// ---------------------------------------------------------------------------

export async function listAssets(
  db: D1Database,
  organizationId: string,
  opts?: {
    status?: AssetStatus;
    category?: AssetCategory;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<FixedAsset[]> {
  const conditions: string[] = ["fa.organization_id = ?"];
  const params: D1Input[] = [organizationId];

  if (opts?.status) {
    conditions.push("fa.status = ?");
    params.push(opts.status);
  }
  if (opts?.category) {
    conditions.push("fa.asset_category = ?");
    params.push(opts.category);
  }
  if (opts?.isActive !== undefined) {
    conditions.push("fa.is_active = ?");
    params.push(opts.isActive ? 1 : 0);
  }

  const where = conditions.join(" AND ");
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT fa.*,
       COALESCE((
         SELECT SUM(ad.expense_minor) FROM asset_depreciation ad
         WHERE ad.asset_id = fa.id AND ad.status = 'posted'
       ), 0) as accumulated_minor,
       (SELECT ad.period FROM asset_depreciation ad
        WHERE ad.asset_id = fa.id AND ad.status = 'posted'
        ORDER BY ad.period DESC LIMIT 1) as last_depreciation_period
     FROM fixed_assets fa
     WHERE ${where}
     ORDER BY fa.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return rows.map(rowToAsset);
}

export async function getAsset(
  db: D1Database,
  organizationId: string,
  assetId: string,
): Promise<FixedAsset | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    `SELECT fa.*,
       COALESCE((
         SELECT SUM(ad.expense_minor) FROM asset_depreciation ad
         WHERE ad.asset_id = fa.id AND ad.status = 'posted'
       ), 0) as accumulated_minor,
       (SELECT ad.period FROM asset_depreciation ad
        WHERE ad.asset_id = fa.id AND ad.status = 'posted'
        ORDER BY ad.period DESC LIMIT 1) as last_depreciation_period
     FROM fixed_assets fa
     WHERE fa.id = ? AND fa.organization_id = ?`,
    [assetId, organizationId],
  );

  if (!row) return null;
  return rowToAsset(row);
}

export async function createAsset(
  db: D1Database,
  organizationId: string,
  userId: string,
  data: {
    assetCode: string;
    assetName: string;
    assetCategory: AssetCategory;
    description?: string;
    acquisitionDate: string;
    acquisitionCostMinor: number;
    residualValueMinor?: number;
    usefulLifeMonths: number;
    depreciationMethod: DepreciationMethod;
    decliningBalanceRate?: number | null;
    accountAssetId: string;
    accountDepreciationId: string;
    accountExpenseId: string;
  },
): Promise<FixedAsset> {
  // Validate residual value <= acquisition cost
  const residual = data.residualValueMinor ?? 0;
  if (residual >= data.acquisitionCostMinor) {
    throw badRequest("asset_invalid_residual", "Nilai residu harus kurang dari biaya perolehan");
  }

  // Validate DB rate for declining balance
  if (data.depreciationMethod === "declining_balance" && (!data.decliningBalanceRate || data.decliningBalanceRate <= 0 || data.decliningBalanceRate > 1)) {
    throw badRequest("asset_invalid_rate", "Tarif declining balance harus antara 0 dan 1");
  }

  // Check for duplicate code
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM fixed_assets WHERE organization_id = ? AND asset_code = ? AND is_active = 1 LIMIT 1`,
    [organizationId, data.assetCode],
  );
  if (existing) {
    throw badRequest("asset_code_exists", `Kode aset '${data.assetCode}' sudah digunakan`);
  }

  const now = Date.now();
  const id = generateId();

  await execute(
    db,
    `INSERT INTO fixed_assets (
      id, organization_id, asset_code, asset_name, asset_category, description,
      acquisition_date, acquisition_cost_minor, residual_value_minor,
      useful_life_months, depreciation_method, declining_balance_rate,
      account_asset_id, account_depreciation_id, account_expense_id,
      status, is_active, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`,
    [
      id, organizationId, data.assetCode, data.assetName, data.assetCategory,
      data.description ?? "", data.acquisitionDate, data.acquisitionCostMinor, residual,
      data.usefulLifeMonths, data.depreciationMethod, data.decliningBalanceRate ?? null,
      data.accountAssetId, data.accountDepreciationId, data.accountExpenseId,
      userId, now, now,
    ],
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "fixed_asset",
    entityId: id,
    action: "asset_created",
    before: null,
    after: data,
    reason: null,
    current: now,
  });

  return (await getAsset(db, organizationId, id))!;
}

export async function updateAsset(
  db: D1Database,
  organizationId: string,
  userId: string,
  assetId: string,
  data: Partial<{
    assetName: string;
    description: string;
    residualValueMinor: number;
    usefulLifeMonths: number;
    depreciationMethod: DepreciationMethod;
    decliningBalanceRate: number | null;
    accountAssetId: string;
    accountDepreciationId: string;
    accountExpenseId: string;
    isActive: boolean;
  }>,
): Promise<FixedAsset> {
  const existing = await getAsset(db, organizationId, assetId);
  if (!existing) throw notFound("asset_not_found", "Aset tidak ditemukan");

  if (existing.status !== "active") {
    throw badRequest("asset_not_active", "Hanya aset aktif yang dapat diubah");
  }

  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: D1Input[] = [now];

  if (data.assetName !== undefined) { sets.push("asset_name = ?"); params.push(data.assetName); }
  if (data.description !== undefined) { sets.push("description = ?"); params.push(data.description); }
  if (data.residualValueMinor !== undefined) { sets.push("residual_value_minor = ?"); params.push(data.residualValueMinor); }
  if (data.usefulLifeMonths !== undefined) { sets.push("useful_life_months = ?"); params.push(data.usefulLifeMonths); }
  if (data.depreciationMethod !== undefined) { sets.push("depreciation_method = ?"); params.push(data.depreciationMethod); }
  if (data.decliningBalanceRate !== undefined) { sets.push("declining_balance_rate = ?"); params.push(data.decliningBalanceRate); }
  if (data.accountAssetId !== undefined) { sets.push("account_asset_id = ?"); params.push(data.accountAssetId); }
  if (data.accountDepreciationId !== undefined) { sets.push("account_depreciation_id = ?"); params.push(data.accountDepreciationId); }
  if (data.accountExpenseId !== undefined) { sets.push("account_expense_id = ?"); params.push(data.accountExpenseId); }
  if (data.isActive !== undefined) { sets.push("is_active = ?"); params.push(data.isActive ? 1 : 0); }

  params.push(assetId, organizationId);

  await execute(
    db,
    `UPDATE fixed_assets SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`,
    params,
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "fixed_asset",
    entityId: assetId,
    action: "asset_updated",
    before: existing,
    after: data,
    reason: null,
    current: now,
  });

  return (await getAsset(db, organizationId, assetId))!;
}

// ---------------------------------------------------------------------------
// Depreciation Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate monthly depreciation for an asset based on its method.
 */
function calculateMonthlyDepreciation(
  asset: FixedAsset,
  monthsElapsed: number,
): number {
  const cost = asset.acquisitionCostMinor;
  const residual = asset.residualValueMinor;
  const depreciableBase = cost - residual;
  const usefulMonths = asset.usefulLifeMonths;

  if (depreciableBase <= 0 || usefulMonths <= 0) return 0;

  switch (asset.depreciationMethod) {
    case "straight_line":
      return Math.round(depreciableBase / usefulMonths);

    case "declining_balance": {
      const rate = asset.decliningBalanceRate ?? (2 / usefulMonths); // Default: double-declining
      const remainingBookValue = cost - (asset.accumulatedMinor ?? 0);
      const monthlyAmount = Math.round(remainingBookValue * rate);
      // Don't depreciate below residual value
      const maxAllowed = remainingBookValue - residual;
      return Math.min(monthlyAmount, Math.max(0, maxAllowed));
    }

    case "sum_of_years_digits": {
      const totalMonths = usefulMonths;
      const remainingMonths = totalMonths - monthsElapsed;
      if (remainingMonths <= 0) return 0;
      // Sum of years digits: remaining life / sum of years * depreciable base
      // For monthly: (remaining months) / (n*(n+1)/2) * depreciable base
      const sumOfMonths = (totalMonths * (totalMonths + 1)) / 2;
      return Math.round((remainingMonths / sumOfMonths) * depreciableBase);
    }

    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Run Depreciation
// ---------------------------------------------------------------------------

/**
 * Run depreciation for a given period (YYYY-MM).
 * Creates pending entries in asset_depreciation for all active assets
 * that haven't been depreciated for this period yet.
 */
export async function runDepreciation(
  db: D1Database,
  organizationId: string,
  period: string, // YYYY-MM
): Promise<DepreciationRunResult> {
  const activeAssets = await queryAll<Record<string, unknown>>(
    db,
    `SELECT fa.*,
       COALESCE((
         SELECT SUM(ad.expense_minor) FROM asset_depreciation ad
         WHERE ad.asset_id = fa.id AND ad.status = 'posted'
       ), 0) as accumulated_minor,
       (SELECT ad.period FROM asset_depreciation ad
        WHERE ad.asset_id = fa.id AND ad.status = 'posted'
        ORDER BY ad.period DESC LIMIT 1) as last_depreciation_period
     FROM fixed_assets fa
     WHERE fa.organization_id = ? AND fa.status = 'active' AND fa.is_active = 1
     ORDER BY fa.created_at ASC`,
    [organizationId],
  );

  const assets = activeAssets.map(rowToAsset);
  let entriesCreated = 0;
  let entriesSkipped = 0;
  let totalExpense = 0;
  const errors: string[] = [];
  const now = Date.now();

  for (const asset of assets) {
    // Skip if asset acquired after this period
    if (asset.acquisitionDate > `${period}-31`) {
      entriesSkipped++;
      continue;
    }

    // Check if already processed for this period
    const existing = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM asset_depreciation WHERE asset_id = ? AND period = ? LIMIT 1`,
      [asset.id, period],
    );
    if (existing) {
      entriesSkipped++;
      continue;
    }

    // Calculate months elapsed since acquisition
    const acqDate = new Date(asset.acquisitionDate);
    const periodDate = new Date(`${period}-01`);
    const monthsElapsed = (periodDate.getFullYear() - acqDate.getFullYear()) * 12
      + (periodDate.getMonth() - acqDate.getMonth());

    // Skip if before acquisition or after useful life
    if (monthsElapsed < 0 || monthsElapsed >= asset.usefulLifeMonths) {
      entriesSkipped++;
      continue;
    }

    // Calculate depreciation amount
    const expenseMinor = calculateMonthlyDepreciation(asset, monthsElapsed);
    if (expenseMinor <= 0) {
      entriesSkipped++;
      continue;
    }

    const accumulatedMinor = (asset.accumulatedMinor ?? 0) + expenseMinor;
    const bookValueMinor = Math.max(0, asset.acquisitionCostMinor - accumulatedMinor);

    try {
      const deprId = generateId();
      await execute(
        db,
        `INSERT INTO asset_depreciation (id, organization_id, asset_id, period,
          expense_minor, accumulated_minor, book_value_minor, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [deprId, organizationId, asset.id, period, expenseMinor, accumulatedMinor, bookValueMinor, now],
      );
      entriesCreated++;
      totalExpense += expenseMinor;
    } catch (err) {
      errors.push(`Asset ${asset.assetCode} (${asset.id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { entriesCreated, entriesSkipped, errors, totalExpense, period };
}

/**
 * Post pending depreciation entries as journal entries.
 * Creates a journal entry for each depreciation period's batch.
 */
export async function postDepreciation(
  db: D1Database,
  organizationId: string,
  userId: string,
  period: string, // YYYY-MM
  entryDate: string, // YYYY-MM-DD
): Promise<{ posted: number; journalEntryId: string | null; errors: string[] }> {
  const pendingEntries = await queryAll<Record<string, unknown>>(
    db,
    `SELECT ad.*, fa.asset_code, fa.asset_name,
       fa.account_depreciation_id, fa.account_expense_id
     FROM asset_depreciation ad
     JOIN fixed_assets fa ON fa.id = ad.asset_id AND fa.organization_id = ad.organization_id
     WHERE ad.organization_id = ? AND ad.period = ? AND ad.status = 'pending'
     ORDER BY ad.asset_id ASC`,
    [organizationId, period],
  );

  if (pendingEntries.length === 0) {
    return { posted: 0, journalEntryId: null, errors: [] };
  }

  // Aggregate by expense account
  const lines = new Map<string, { debit: number; credit: number }>();
  for (const row of pendingEntries) {
    const expenseId = row.account_expense_id as string;
    const deprId = row.account_depreciation_id as string;
    const amount = row.expense_minor as number;

    // Debit depreciation expense
    lines.set(expenseId, {
      debit: (lines.get(expenseId)?.debit ?? 0) + amount,
      credit: 0,
    });
    // Credit accumulated depreciation
    lines.set(deprId, {
      debit: 0,
      credit: (lines.get(deprId)?.credit ?? 0) + amount,
    });
  }

  // Verify balance
  const totalDebit = Array.from(lines.values()).reduce((s, l) => s + l.debit, 0);
  const totalCredit = Array.from(lines.values()).reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) {
    return { posted: 0, journalEntryId: null, errors: ["Journal unbalanced"] };
  }

  const now = Date.now();
  const journalEntryId = generateId();
  const entryNumber = `DEPR-${period}`;
  const statements: D1PreparedStatement[] = [];

  // Create journal entry
  statements.push(
    statement(
      db,
      `INSERT INTO journal_entries (id, organization_id, entry_number, entry_date, entry_type,
        description, status, posted_at, posted_by, created_at)
       VALUES (?, ?, ?, ?, 'adjustment', ?, 'posted', ?, ?, ?)`,
      [journalEntryId, organizationId, entryNumber, entryDate,
       `Depresiasi aset tetap periode ${period}`, now, userId, now],
    ),
  );

  // Create journal lines
  for (const [accountId, line] of lines) {
    statements.push(
      statement(
        db,
        `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id,
          debit_minor, credit_minor, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), organizationId, journalEntryId, accountId,
         line.debit, line.credit, `Depresiasi ${period}`],
      ),
    );
  }

  // Update depreciation entries to posted
  for (const row of pendingEntries) {
    statements.push(
      statement(
        db,
        `UPDATE asset_depreciation SET status = 'posted', journal_entry_id = ?
         WHERE id = ? AND organization_id = ?`,
        [journalEntryId, row.id, organizationId],
      ),
    );
  }

  statements.push(
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "depreciation",
      entityId: journalEntryId,
      action: "depreciation_posted",
      before: null,
      after: { period, entryDate, totalExpense: totalDebit, assetCount: pendingEntries.length },
      reason: null,
      current: now,
    }),
  );

  await executeBatch(db, statements);

  return { posted: pendingEntries.length, journalEntryId, errors: [] };
}

/**
 * Get pending depreciation for a period (for preview before posting).
 */
export async function getPendingDepreciation(
  db: D1Database,
  organizationId: string,
  period: string,
): Promise<{
  entries: { assetCode: string; assetName: string; expenseMinor: number }[];
  totalExpense: number;
}> {
  const rows = await queryAll<{ asset_code: string; asset_name: string; expense_minor: number }>(
    db,
    `SELECT fa.asset_code, fa.asset_name, ad.expense_minor
     FROM asset_depreciation ad
     JOIN fixed_assets fa ON fa.id = ad.asset_id AND fa.organization_id = ad.organization_id
     WHERE ad.organization_id = ? AND ad.period = ? AND ad.status = 'pending'
     ORDER BY fa.asset_code ASC`,
    [organizationId, period],
  );

  return {
    entries: rows.map((r) => ({
      assetCode: r.asset_code,
      assetName: r.asset_name,
      expenseMinor: r.expense_minor,
    })),
    totalExpense: rows.reduce((s, r) => s + r.expense_minor, 0),
  };
}

// ---------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------

export async function disposeAsset(
  db: D1Database,
  organizationId: string,
  userId: string,
  assetId: string,
  data: {
    disposalDate: string;
    disposalPriceMinor: number;
    disposalReason: string;
    disposalType: "disposed" | "sold";
  },
): Promise<FixedAsset> {
  const asset = await getAsset(db, organizationId, assetId);
  if (!asset) throw notFound("asset_not_found", "Aset tidak ditemukan");
  if (asset.status !== "active") {
    throw badRequest("asset_already_disposed", "Aset sudah tidak aktif");
  }

  const now = Date.now();

  await execute(
    db,
    `UPDATE fixed_assets SET
      status = ?, disposal_date = ?, disposal_price_minor = ?,
      disposal_reason = ?, updated_at = ?
     WHERE id = ? AND organization_id = ?`,
    [data.disposalType, data.disposalDate, data.disposalPriceMinor, data.disposalReason, now, assetId, organizationId],
  );

  // Create journal entry for disposal
  // Debit: accumulated depreciation account (remove accumulated depr)
  // Debit: cash/bank if sold (disposal price)
  // Credit: asset account (remove asset cost)
  // Credit/Loss: gain/loss on disposal (if sold price differs from book value)
  const bookValue = asset.bookValueMinor ?? asset.acquisitionCostMinor - (asset.accumulatedMinor ?? 0);
  const accumulated = asset.accumulatedMinor ?? 0;
  const gainLoss = data.disposalPriceMinor - bookValue;

  // Find a cash account for disposal proceeds (first active cash account)
  const cashAccount = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM accounts WHERE organization_id = ? AND is_cash_account = 1 AND is_active = 1 LIMIT 1`,
    [organizationId],
  );

  const journalEntryId = generateId();
  const entryNumber = `DISP-${asset.assetCode}-${data.disposalDate}`;
  const statements: D1PreparedStatement[] = [];

  statements.push(
    execute(
      db,
      `INSERT INTO journal_entries (id, organization_id, entry_number, entry_date, entry_type,
        description, status, posted_at, posted_by, created_at)
       VALUES (?, ?, ?, ?, 'adjustment', ?, 'posted', ?, ?, ?)`,
      [journalEntryId, organizationId, entryNumber, data.disposalDate,
       `Pelepasan aset ${asset.assetName} (${asset.assetCode})`, now, userId, now],
    ),
  );

  // Debit accumulated depreciation
  if (accumulated > 0) {
    statements.push(
      execute(
        db,
        `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id,
          debit_minor, credit_minor, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), organizationId, journalEntryId, asset.accountDepreciationId,
         accumulated, 0, `Akumulasi depresiasi ${asset.assetCode}`],
      ),
    );
  }

  // Credit asset account (remove cost)
  statements.push(
    execute(
      db,
      `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id,
        debit_minor, credit_minor, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), organizationId, journalEntryId, asset.accountAssetId,
       0, asset.acquisitionCostMinor, `Hapus biaya perolehan ${asset.assetCode}`],
    ),
  );

  // If sold, debit cash account
  if (data.disposalType === "sold" && data.disposalPriceMinor > 0 && cashAccount) {
    statements.push(
      execute(
        db,
        `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id,
          debit_minor, credit_minor, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), organizationId, journalEntryId, cashAccount.id,
         data.disposalPriceMinor, 0, `Hasil penjualan ${asset.assetCode}`],
      ),
    );
  }

  // Gain/loss on disposal
  const gainLossAccount = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM accounts
     WHERE organization_id = ? AND account_type = 'other_income'
       AND is_active = 1 LIMIT 1`,
    [organizationId],
  );
  const lossAccount = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM accounts
     WHERE organization_id = ? AND account_type = 'other_expense'
       AND is_active = 1 LIMIT 1`,
    [organizationId],
  );

  if (gainLoss !== 0) {
    if (gainLoss > 0 && gainLossAccount) {
      // Gain on sale — credit
      statements.push(
        execute(
          db,
          `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id,
            debit_minor, credit_minor, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), organizationId, journalEntryId, gainLossAccount.id,
           0, gainLoss, `Laba penjualan ${asset.assetCode}`],
        ),
      );
    } else if (gainLoss < 0 && lossAccount) {
      // Loss on sale — debit
      statements.push(
        execute(
          db,
          `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id,
            debit_minor, credit_minor, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), organizationId, journalEntryId, lossAccount.id,
           Math.abs(gainLoss), 0, `Rugi penjualan ${asset.assetCode}`],
        ),
      );
    }
  }

  // Mark pending depreciation entries as skipped for this asset
  statements.push(
    execute(
      db,
      `UPDATE asset_depreciation SET status = 'skipped'
       WHERE asset_id = ? AND status = 'pending'`,
      [assetId],
    ),
  );

  statements.push(
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "fixed_asset",
      entityId: assetId,
      action: "asset_disposed",
      before: { status: asset.status, bookValue, accumulatedDepreciation: accumulated },
      after: data,
      reason: data.disposalReason,
      current: now,
    }),
  );

  await executeBatch(db, statements);

  return (await getAsset(db, organizationId, assetId))!;
}

// ---------------------------------------------------------------------------
// Book Value Report
// ---------------------------------------------------------------------------

export async function getBookValueReport(
  db: D1Database,
  organizationId: string,
  asOfDate?: string,
): Promise<BookValueReport[]> {
  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT fa.*,
       COALESCE((
         SELECT SUM(ad.expense_minor) FROM asset_depreciation ad
         WHERE ad.asset_id = fa.id AND ad.status = 'posted'
           AND (? IS NULL OR ad.period <= ?)
       ), 0) as accumulated_minor
     FROM fixed_assets fa
     WHERE fa.organization_id = ? AND fa.is_active = 1
     ORDER BY fa.asset_category ASC, fa.asset_code ASC`,
    [asOfDate ? asOfDate.slice(0, 7) : null, asOfDate ? asOfDate.slice(0, 7) : null, organizationId],
  );

  const report: BookValueReport[] = [];

  for (const row of rows) {
    const asset = rowToAsset(row);
    const accumulated = (row.accumulated_minor as number) ?? 0;
    const bookValue = Math.max(0, asset.acquisitionCostMinor - accumulated);

    // Calculate months elapsed since acquisition
    const acqDate = new Date(asset.acquisitionDate);
    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    const monthsElapsed = Math.max(0, (asOf.getFullYear() - acqDate.getFullYear()) * 12
      + (asOf.getMonth() - acqDate.getMonth()));

    const monthlyDep = calculateMonthlyDepreciation(asset, monthsElapsed);

    report.push({
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.assetName,
      assetCategory: asset.assetCategory,
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCostMinor,
      accumulatedDepreciation: accumulated,
      bookValue,
      residualValue: asset.residualValueMinor,
      depreciationMethod: asset.depreciationMethod,
      usefulLifeMonths: asset.usefulLifeMonths,
      monthsElapsed,
      monthlyDepreciation: monthlyDep,
      status: asset.status,
    });
  }

  return report;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToAsset(row: Record<string, unknown>): FixedAsset {
  const accumulated = (row.accumulated_minor as number) ?? 0;
  const acquisitionCost = row.acquisition_cost_minor as number;

  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    assetCode: row.asset_code as string,
    assetName: row.asset_name as string,
    assetCategory: row.asset_category as AssetCategory,
    description: (row.description as string) ?? "",
    acquisitionDate: row.acquisition_date as string,
    acquisitionCostMinor: acquisitionCost,
    residualValueMinor: (row.residual_value_minor as number) ?? 0,
    usefulLifeMonths: row.useful_life_months as number,
    depreciationMethod: row.depreciation_method as DepreciationMethod,
    decliningBalanceRate: row.declining_balance_rate as number | null,
    accountAssetId: row.account_asset_id as string,
    accountDepreciationId: row.account_depreciation_id as string,
    accountExpenseId: row.account_expense_id as string,
    status: row.status as AssetStatus,
    disposalDate: row.disposal_date as string | null,
    disposalPriceMinor: row.disposal_price_minor as number | null,
    disposalReason: row.disposal_reason as string | null,
    isActive: (row.is_active as number) === 1,
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    bookValueMinor: Math.max(0, acquisitionCost - accumulated),
    accumulatedMinor: accumulated,
    lastDepreciationPeriod: row.last_depreciation_period as string | null,
  };
}
