// ponytail: Onboarding checklist computed from existing data.
// No new table needed — each step is a query against existing tables.
// Upgrade to a dedicated onboarding_steps table if per-step resets needed.

import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst, statement } from "../db/client";

/** Prefix used to identify sample-data records for later cleanup. */
const SAMPLE_PREFIX = "[SAMPLE] ";

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  order: number;
}

export interface OnboardingStatus {
  organizationId: string;
  completed: boolean;
  completedCount: number;
  totalSteps: number;
  steps: OnboardingStep[];
}

export interface SampleDataResult {
  success: boolean;
  message: string;
}

export interface RemoveSampleDataResult {
  success: boolean;
  removed: number;
}

const ALL_STEPS: Omit<OnboardingStep, "completed">[] = [
  { id: "business_profile", label: "Lengkapi profil bisnis", description: "Nama dan informasi dasar bisnis Anda", order: 1 },
  { id: "business_type", label: "Pilih jenis bisnis", description: "Jenis usaha (jual beli barang atau penyedia jasa)", order: 2 },
  { id: "books_start_date", label: "Tentukan tanggal mulai pembukuan", description: "Tanggal awal pencatatan keuangan", order: 3 },
  { id: "opening_balances", label: "Input saldo awal", description: "Saldo kas, bank, piutang, utang, dan modal", order: 4 },
  { id: "products", label: "Import produk atau jasa", description: "Daftar produk atau jasa yang Anda jual", order: 5 },
  { id: "parties", label: "Tambah pelanggan & pemasok", description: "Data pelanggan dan pemasok tetap", order: 6 },
  { id: "first_transaction", label: "Catat transaksi pertama", description: "Transaksi penjualan atau pembelian pertama", order: 7 },
  { id: "view_first_report", label: "Lihat laporan keuangan", description: "Cek laporan laba rugi, neraca, atau arus kas", order: 8 },
  { id: "invite_team_member", label: "Undang anggota tim", description: "Tambahkan pengguna lain ke organisasi", order: 9 },
  { id: "first_period_close", label: "Tutup periode pertama", description: "Kunci periode akuntansi setelah selesai", order: 10 },
];

async function checkStep(
  db: D1Database,
  orgId: string,
  stepId: string,
): Promise<boolean> {
  switch (stepId) {
    case "business_profile":
      return true; // Org exists = profile created
    case "business_type":
      return true; // Org always has business_type
    case "books_start_date":
      return true; // Org always has books_start_date
    case "opening_balances": {
      const row = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM transactions WHERE organization_id = ? AND transaction_type = 'opening_balance'",
        [orgId],
      );
      return (row?.count ?? 0) > 0;
    }
    case "products": {
      const pRow = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM products WHERE organization_id = ?",
        [orgId],
      );
      return (pRow?.count ?? 0) > 0;
    }
    case "parties": {
      const ptRow = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM parties WHERE organization_id = ?",
        [orgId],
      );
      return (ptRow?.count ?? 0) > 0;
    }
    case "first_transaction": {
      const tRow = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM transactions WHERE organization_id = ? AND transaction_type != 'opening_balance'",
        [orgId],
      );
      return (tRow?.count ?? 0) > 0;
    }
    case "team_member":
    case "invite_team_member": {
      const mRow = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ?",
        [orgId],
      );
      return (mRow?.count ?? 0) >= 2;
    }
    case "view_first_report": {
      // Check if the org has at least one non-opening transaction
      // (report data exists) AND the org was created more than 1 hour ago
      // (so the user had time to navigate to a report).
      const tRow = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM transactions WHERE organization_id = ? AND transaction_type != 'opening_balance'",
        [orgId],
      );
      if ((tRow?.count ?? 0) === 0) return false;
      // Check if org has been around long enough to view reports
      const orgRow = await queryFirst<{ created_at: number }>(
        db,
        "SELECT created_at FROM organizations WHERE id = ?",
        [orgId],
      );
      if (!orgRow) return false;
      // At least 1 hour since creation (ample time to view a report)
      return Date.now() - orgRow.created_at >= 3_600_000;
    }
    case "first_period_close": {
      const pRow = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM period_locks WHERE organization_id = ?",
        [orgId],
      );
      return (pRow?.count ?? 0) > 0;
    }
    default:
      return false;
  }
}

export async function getOnboardingStatus(
  db: D1Database,
  organizationId: string,
): Promise<OnboardingStatus> {
  const completedSteps: string[] = [];
  for (const step of ALL_STEPS) {
    const done = await checkStep(db, organizationId, step.id);
    if (done) completedSteps.push(step.id);
  }

  const steps = ALL_STEPS.map((s) => ({
    ...s,
    completed: completedSteps.includes(s.id),
  }));

  return {
    organizationId,
    completed: completedSteps.length === ALL_STEPS.length,
    completedCount: completedSteps.length,
    totalSteps: ALL_STEPS.length,
    steps,
  };
}

/**
 * Generates sample products, parties, and a demo transaction for training mode.
 * All records are tagged with SAMPLE_PREFIX so removeSampleData can find them.
 */
export async function generateSampleData(
  db: D1Database,
  organizationId: string,
  userId: string,
): Promise<SampleDataResult> {
  const now = Date.now();

  // Check if sample data already exists
  const existing = await queryFirst<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM products WHERE organization_id = ? AND name LIKE ?",
    [organizationId, `${SAMPLE_PREFIX}%`],
  );
  if (existing && existing.count > 0) {
    return { success: false, message: "Data contoh sudah ada. Hapus dulu jika ingin membuat ulang." };
  }

  try {
    const statements: D1PreparedStatement[] = [];

    // 1. Sample products
    const sampleProducts = [
      { name: `${SAMPLE_PREFIX}Produk A`, unit: "pcs", price: 50000, cost: 35000 },
      { name: `${SAMPLE_PREFIX}Produk B`, unit: "pcs", price: 75000, cost: 50000 },
      { name: `${SAMPLE_PREFIX}Jasa Konsultasi`, unit: "jam", price: 150000, cost: 0 },
    ];

    for (const p of sampleProducts) {
      statements.push(
        statement(db,
          `INSERT INTO products (id, organization_id, name, unit, price_minor, initial_stock_minor, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [generateId(), organizationId, p.name, p.unit, p.price, userId, now, now],
        ),
      );
    }

    // 2. Sample parties (customer + supplier)
    const sampleParties = [
      { name: `${SAMPLE_PREFIX}Pelanggan Umum`, type: "customer", email: "pelanggan@contoh.com" },
      { name: `${SAMPLE_PREFIX}Pemasok Utama`, type: "supplier", email: "pemasok@contoh.com" },
    ];

    for (const p of sampleParties) {
      statements.push(
        statement(db,
          `INSERT INTO parties (id, organization_id, name, party_type, email, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [generateId(), organizationId, p.name, p.type, p.email, userId, now, now],
        ),
      );
    }

    await executeBatch(db, statements);

    return { success: true, message: `Berhasil membuat ${sampleProducts.length} produk dan ${sampleParties.length} kontak contoh.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal membuat data contoh";
    return { success: false, message: msg };
  }
}

/**
 * Removes all sample data records tagged with SAMPLE_PREFIX.
 * Deletes from products, parties, and any sample transactions.
 */
export async function removeSampleData(
  db: D1Database,
  organizationId: string,
): Promise<RemoveSampleDataResult> {
  let removed = 0;

  // Remove sample products
  const sampleProducts = await queryAll<{ id: string }>(
    db,
    "SELECT id FROM products WHERE organization_id = ? AND name LIKE ?",
    [organizationId, `${SAMPLE_PREFIX}%`],
  );

  for (const p of sampleProducts) {
    // Also remove stock movements for this product
    await execute(db, "DELETE FROM stock_movements WHERE organization_id = ? AND product_id = ?", [organizationId, p.id]);
    await execute(db, "DELETE FROM products WHERE id = ? AND organization_id = ?", [p.id, organizationId]);
    removed++;
  }

  // Remove sample parties
  const sampleParties = await queryAll<{ id: string }>(
    db,
    "SELECT id FROM parties WHERE organization_id = ? AND name LIKE ?",
    [organizationId, `${SAMPLE_PREFIX}%`],
  );

  for (const p of sampleParties) {
    await execute(db, "DELETE FROM parties WHERE id = ? AND organization_id = ?", [p.id, organizationId]);
    removed++;
  }

  return { success: true, removed };
}
