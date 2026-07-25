// ponytail: Onboarding checklist computed from existing data.
// No new table needed — each step is a query against existing tables.
// Upgrade to a dedicated onboarding_steps table if per-step resets needed.

import { queryFirst } from "../db/client";

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

const ALL_STEPS: Omit<OnboardingStep, "completed">[] = [
  { id: "business_profile", label: "Lengkapi profil bisnis", description: "Nama, alamat, dan informasi dasar bisnis", order: 1 },
  { id: "business_type", label: "Pilih jenis bisnis", description: "Jenis usaha dan mata uang", order: 2 },
  { id: "books_start_date", label: "Tentukan tanggal mulai pembukuan", description: "Tanggal awal pencatatan keuangan", order: 3 },
  { id: "opening_balances", label: "Input saldo awal", description: "Saldo kas, bank, piutang, utang, dan persediaan", order: 4 },
  { id: "products", label: "Import produk atau jasa", description: "Daftar produk atau jasa yang dijual", order: 5 },
  { id: "parties", label: "Tambah pelanggan & pemasok", description: "Data pelanggan dan pemasok", order: 6 },
  { id: "first_transaction", label: "Catat transaksi pertama", description: "Transaksi penjualan atau pembelian pertama", order: 7 },
  { id: "team_member", label: "Undang anggota tim", description: "Tambahkan pengguna lain ke organisasi", order: 8 },
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
    case "team_member": {
      const mRow = await queryFirst<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ?",
        [orgId],
      );
      return (mRow?.count ?? 0) >= 2;
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
