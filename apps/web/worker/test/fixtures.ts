import { FakeD1Database } from "./fake-d1";
import { hashToken } from "../auth/tokens";
import { hashPassword } from "../auth/password";

/**
 * Deterministic seeded test fixtures for MVP accounting and security tests.
 *
 * Two organizations (Org A and Org B) plus an empty organization, each with an
 * owner user and session. Org A carries a full MVP chart of accounts and
 * posted transactions (owner_deposit, cash_in, cash_out, transfer) with their
 * journal entries/lines, so report and balance tests have data to compute on.
 *
 * All monetary values are integer IDR. Fixture IDs are centrally defined to
 * avoid scattering them through tests.
 *
 * FakeD1 is stateless, so every write goes through runtime mirrors of the seed
 * arrays. `createSeedFixtures()` resets those mirrors, giving every test its
 * own isolated database.
 */

// ── Central ID Definitions ─────────────────────────────────────
export const FIXTURE_IDS = {
  users: {
    ownerA: "user-orga-owner-00001",
    ownerB: "user-orgb-owner-00001",
    ownerEmpty: "user-empty-owner-00001",
  },
  orgs: {
    a: "org-a-test-fixture-0001",
    b: "org-b-test-fixture-0001",
    empty: "org-empty-test-000001",
  },
  accounts: {
    cashA: "acct-orga-cash-000001",
    bankA: "acct-orga-bank-000001",
    inventoryA: "acct-orga-inv-000001",
    cogsA: "acct-orga-cogs-000001",
    equityA: "acct-orga-eq-0000001",
    drawA: "acct-orga-draw-000001",
    revenueA: "acct-orga-rev-0000001",
    otherRevenueA: "acct-orga-rev2-000001",
    expenseSalaryA: "acct-orga-exp1-000001",
    expenseRentA: "acct-orga-exp2-000001",
    cashB: "acct-orgb-cash-000001",
    inventoryB: "acct-orgb-inv-000001",
    cogsB: "acct-orgb-cogs-000001",
    equityB: "acct-orgb-eq-0000001",
    revenueB: "acct-orgb-rev-0000001",
    expenseB: "acct-orgb-exp-0000001",
  },
  products: {
    kopiA: "prod-orga-kopi-00001",
    gulaA: "prod-orga-gula-00001",
    kopiB: "prod-orgb-kopi-00001",
  },
  transactions: {
    depositA: "txn-orga-deposit-0001",
    cashInA: "txn-orga-cshin-00001",
    cashOutA: "txn-orga-cshout-00001",
    transferA: "txn-orga-trsfr-00001",
    cashInB1: "txn-orga-cshin-00002",
    voidedOutA: "txn-orga-voided-0001",
    cashInB: "txn-orgb-cshin-00001",
    depositB: "txn-orgb-deposit-0001",
  },
} as const;

const NOW = 1750000000000; // Fixed timestamp for seed rows (2025-06-16)

// ── Seed data templates ────────────────────────────────────────

interface SeedUser {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface SeedOrganization {
  id: string;
  name: string;
  base_currency: string;
  status: "active" | "disabled";
  created_at: number;
  updated_at: number;
}

interface SeedMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner";
  created_at: number;
}

interface SeedSession {
  id: string;
  user_id: string;
  token_hash: string;
  current_organization_id: string | null;
  expires_at: number;
  last_used_at: number;
  last_rotated_at: number | null;
  created_at: number;
  revoked_at: number | null;
  previous_token_hash: string | null;
  previous_token_expires_at: number | null;
}

interface SeedOAuthAccount {
  id: string;
  user_id: string;
  provider: "google";
  provider_account_id: string;
  email: string | null;
  created_at: number;
  updated_at: number;
}

interface SeedAccount {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  account_class: "asset" | "liability" | "equity" | "income" | "expense";
  account_subtype: "cash" | "bank" | null;
  account_kind: "inventory" | "cogs" | null;
  is_system: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface SeedProduct {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  unit: string;
  selling_price_idr: number;
  current_stock_milli: number;
  average_cost_minor: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface SeedStockMovement {
  id: string;
  organization_id: string;
  transaction_id: string;
  product_id: string;
  quantity_milli: number;
  unit_cost_minor: number;
  cost_total_idr: number;
  created_at: number;
}

interface SeedTransaction {
  id: string;
  organization_id: string;
  transaction_number: string;
  transaction_type: "cash_in" | "cash_out" | "transfer" | "owner_deposit" | "owner_withdrawal";
  transaction_date: string;
  description: string;
  status: "posted" | "voided";
  amount_idr: number;
  cash_account_id: string;
  counter_account_id: string;
  idempotency_key: string;
  idempotency_payload_hash?: string | null;
  created_by: string;
  created_at: number;
  voided_at: number | null;
  void_reason: string | null;
  updated_at: number;
}

interface SeedJournalEntry {
  id: string;
  organization_id: string;
  transaction_id: string;
  entry_date: string;
  description: string;
  created_at: number;
}

interface SeedJournalLine {
  id: string;
  organization_id: string;
  journal_entry_id: string;
  account_id: string;
  debit_idr: number;
  credit_idr: number;
  created_at: number;
}

const TEST_PASSWORD = "Password123";
const TEST_PEPPER = "test-pepper";

const SEED_USERS: SeedUser[] = [
  { id: FIXTURE_IDS.users.ownerA, email: "owner@orga.test", password_hash: "", full_name: "Owner A", status: "active", created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.ownerB, email: "owner@orgb.test", password_hash: "", full_name: "Owner B", status: "active", created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.ownerEmpty, email: "owner@empty.test", password_hash: "", full_name: "Owner Empty", status: "active", created_at: NOW, updated_at: NOW },
];

const SEED_ORGS: SeedOrganization[] = [
  { id: FIXTURE_IDS.orgs.a, name: "PT Organisasi A", base_currency: "IDR", status: "active", created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.orgs.b, name: "CV Organisasi B", base_currency: "IDR", status: "active", created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.orgs.empty, name: "Empty Organization", base_currency: "IDR", status: "active", created_at: NOW, updated_at: NOW },
];

const SEED_MEMBERSHIPS: SeedMembership[] = [
  { id: "mem-orga-owner-0001", organization_id: FIXTURE_IDS.orgs.a, user_id: FIXTURE_IDS.users.ownerA, role: "owner", created_at: NOW },
  { id: "mem-orgb-owner-0001", organization_id: FIXTURE_IDS.orgs.b, user_id: FIXTURE_IDS.users.ownerB, role: "owner", created_at: NOW },
  { id: "mem-empty-owner-0001", organization_id: FIXTURE_IDS.orgs.empty, user_id: FIXTURE_IDS.users.ownerEmpty, role: "owner", created_at: NOW },
];

// Sessions are keyed by precomputed SHA-256 of the plaintext token so
// getSessionByToken (which hashes the incoming token) resolves correctly.
// Timestamps are filled relative to load time in buildSessions().
const SEED_SESSIONS: SeedSession[] = [
  { id: "session-orga-owner-1", user_id: FIXTURE_IDS.users.ownerA, token_hash: "", current_organization_id: FIXTURE_IDS.orgs.a, expires_at: 0, last_used_at: 0, last_rotated_at: null, created_at: 0, revoked_at: null, previous_token_hash: null, previous_token_expires_at: null },
  { id: "session-orgb-owner-1", user_id: FIXTURE_IDS.users.ownerB, token_hash: "", current_organization_id: FIXTURE_IDS.orgs.b, expires_at: 0, last_used_at: 0, last_rotated_at: null, created_at: 0, revoked_at: null, previous_token_hash: null, previous_token_expires_at: null },
  { id: "session-empty-owner-1", user_id: FIXTURE_IDS.users.ownerEmpty, token_hash: "", current_organization_id: FIXTURE_IDS.orgs.empty, expires_at: 0, last_used_at: 0, last_rotated_at: null, created_at: 0, revoked_at: null, previous_token_hash: null, previous_token_expires_at: null },
];

const SEED_ACCOUNTS: SeedAccount[] = [
  { id: FIXTURE_IDS.accounts.cashA, organization_id: FIXTURE_IDS.orgs.a, code: "1110", name: "Kas", account_class: "asset", account_subtype: "cash", account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.bankA, organization_id: FIXTURE_IDS.orgs.a, code: "1120", name: "Bank", account_class: "asset", account_subtype: "bank", account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.inventoryA, organization_id: FIXTURE_IDS.orgs.a, code: "1130", name: "Persediaan", account_class: "asset", account_subtype: null, account_kind: "inventory", is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.cogsA, organization_id: FIXTURE_IDS.orgs.a, code: "6190", name: "Harga Pokok Penjualan", account_class: "expense", account_subtype: null, account_kind: "cogs", is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.equityA, organization_id: FIXTURE_IDS.orgs.a, code: "3110", name: "Modal Pemilik", account_class: "equity", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.drawA, organization_id: FIXTURE_IDS.orgs.a, code: "3120", name: "Pengambilan Pemilik", account_class: "equity", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.revenueA, organization_id: FIXTURE_IDS.orgs.a, code: "4110", name: "Pendapatan Usaha", account_class: "income", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.otherRevenueA, organization_id: FIXTURE_IDS.orgs.a, code: "4120", name: "Pendapatan Lain", account_class: "income", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.expenseSalaryA, organization_id: FIXTURE_IDS.orgs.a, code: "6110", name: "Beban Gaji & Upah", account_class: "expense", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.expenseRentA, organization_id: FIXTURE_IDS.orgs.a, code: "6120", name: "Beban Sewa", account_class: "expense", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.cashB, organization_id: FIXTURE_IDS.orgs.b, code: "1110", name: "Kas", account_class: "asset", account_subtype: "cash", account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.inventoryB, organization_id: FIXTURE_IDS.orgs.b, code: "1130", name: "Persediaan", account_class: "asset", account_subtype: null, account_kind: "inventory", is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.cogsB, organization_id: FIXTURE_IDS.orgs.b, code: "6190", name: "Harga Pokok Penjualan", account_class: "expense", account_subtype: null, account_kind: "cogs", is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.equityB, organization_id: FIXTURE_IDS.orgs.b, code: "3110", name: "Modal Pemilik", account_class: "equity", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.revenueB, organization_id: FIXTURE_IDS.orgs.b, code: "4110", name: "Pendapatan Usaha", account_class: "income", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.expenseB, organization_id: FIXTURE_IDS.orgs.b, code: "6110", name: "Beban Gaji & Upah", account_class: "expense", account_subtype: null, account_kind: null, is_system: 1, is_active: 1, created_at: NOW, updated_at: NOW },
];

// Produk di-seed tanpa stok awal; WAC/stok diuji melalui transaksi pembelian.
const SEED_PRODUCTS: SeedProduct[] = [
  { id: FIXTURE_IDS.products.kopiA, organization_id: FIXTURE_IDS.orgs.a, code: "PRD-0001", name: "Kopi Bubuk 250g", unit: "bungkus", selling_price_idr: 50000, current_stock_milli: 0, average_cost_minor: 0, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.products.gulaA, organization_id: FIXTURE_IDS.orgs.a, code: "PRD-0002", name: "Gula Pasir 1kg", unit: "kg", selling_price_idr: 18000, current_stock_milli: 0, average_cost_minor: 0, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.products.kopiB, organization_id: FIXTURE_IDS.orgs.b, code: "PRD-0001", name: "Kopi Bubuk 250g", unit: "bungkus", selling_price_idr: 55000, current_stock_milli: 0, average_cost_minor: 0, is_active: 1, created_at: NOW, updated_at: NOW },
];

const SEED_TRANSACTIONS: SeedTransaction[] = [
  // Org A — June 2026
  {
    id: FIXTURE_IDS.transactions.depositA, organization_id: FIXTURE_IDS.orgs.a,
    transaction_number: "TRX-20260605-AB12", transaction_type: "owner_deposit",
    transaction_date: "2026-06-05", description: "Setoran modal awal",
    status: "posted", amount_idr: 5000000, cash_account_id: FIXTURE_IDS.accounts.cashA,
    counter_account_id: FIXTURE_IDS.accounts.equityA, idempotency_key: "idem-deposit-orga-01",
    created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, voided_at: null, void_reason: null, updated_at: NOW,
  },
  {
    id: FIXTURE_IDS.transactions.cashInA, organization_id: FIXTURE_IDS.orgs.a,
    transaction_number: "TRX-20260610-CD34", transaction_type: "cash_in",
    transaction_date: "2026-06-10", description: "Penjualan tunai",
    status: "posted", amount_idr: 2000000, cash_account_id: FIXTURE_IDS.accounts.cashA,
    counter_account_id: FIXTURE_IDS.accounts.revenueA, idempotency_key: "idem-cshin-orga-01",
    created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, voided_at: null, void_reason: null, updated_at: NOW,
  },
  {
    id: FIXTURE_IDS.transactions.cashOutA, organization_id: FIXTURE_IDS.orgs.a,
    transaction_number: "TRX-20260615-EF56", transaction_type: "cash_out",
    transaction_date: "2026-06-15", description: "Bayar sewa ruko",
    status: "posted", amount_idr: 1200000, cash_account_id: FIXTURE_IDS.accounts.cashA,
    counter_account_id: FIXTURE_IDS.accounts.expenseRentA, idempotency_key: "idem-cshout-orga-01",
    created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, voided_at: null, void_reason: null, updated_at: NOW,
  },
  {
    id: FIXTURE_IDS.transactions.transferA, organization_id: FIXTURE_IDS.orgs.a,
    transaction_number: "TRX-20260620-GH78", transaction_type: "transfer",
    transaction_date: "2026-06-20", description: "Pindah ke bank",
    status: "posted", amount_idr: 500000, cash_account_id: FIXTURE_IDS.accounts.cashA,
    counter_account_id: FIXTURE_IDS.accounts.bankA, idempotency_key: "idem-trsfr-orga-01",
    created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, voided_at: null, void_reason: null, updated_at: NOW,
  },
  // Org A — July 2026 (for period-filtered report tests)
  {
    id: FIXTURE_IDS.transactions.cashInB1, organization_id: FIXTURE_IDS.orgs.a,
    transaction_number: "TRX-20260702-JK90", transaction_type: "cash_in",
    transaction_date: "2026-07-02", description: "Penjualan tunai Juli",
    status: "posted", amount_idr: 800000, cash_account_id: FIXTURE_IDS.accounts.cashA,
    counter_account_id: FIXTURE_IDS.accounts.revenueA, idempotency_key: "idem-cshin-orga-02",
    created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, voided_at: null, void_reason: null, updated_at: NOW,
  },
  // Voided transaction - must be excluded from reports and balances
  {
    id: FIXTURE_IDS.transactions.voidedOutA, organization_id: FIXTURE_IDS.orgs.a,
    transaction_number: "TRX-20260705-LM12", transaction_type: "cash_out",
    transaction_date: "2026-07-05", description: "Beban dibatalkan",
    status: "voided", amount_idr: 100000, cash_account_id: FIXTURE_IDS.accounts.cashA,
    counter_account_id: FIXTURE_IDS.accounts.expenseSalaryA, idempotency_key: "idem-voided-orga-01",
    created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, voided_at: NOW, void_reason: "Salah input", updated_at: NOW,
  },
  // Org B — June 2026
  {
    id: FIXTURE_IDS.transactions.depositB, organization_id: FIXTURE_IDS.orgs.b,
    transaction_number: "TRX-20260601-AB11", transaction_type: "owner_deposit",
    transaction_date: "2026-06-01", description: "Setoran modal",
    status: "posted", amount_idr: 3000000, cash_account_id: FIXTURE_IDS.accounts.cashB,
    counter_account_id: FIXTURE_IDS.accounts.equityB, idempotency_key: "idem-deposit-orgb-01",
    created_by: FIXTURE_IDS.users.ownerB, created_at: NOW, voided_at: null, void_reason: null, updated_at: NOW,
  },
  {
    id: FIXTURE_IDS.transactions.cashInB, organization_id: FIXTURE_IDS.orgs.b,
    transaction_number: "TRX-20260612-CD33", transaction_type: "cash_in",
    transaction_date: "2026-06-12", description: "Penjualan tunai B",
    status: "posted", amount_idr: 1000000, cash_account_id: FIXTURE_IDS.accounts.cashB,
    counter_account_id: FIXTURE_IDS.accounts.revenueB, idempotency_key: "idem-cshin-orgb-01",
    created_by: FIXTURE_IDS.users.ownerB, created_at: NOW, voided_at: null, void_reason: null, updated_at: NOW,
  },
];

const SEED_JOURNAL_ENTRIES: SeedJournalEntry[] = SEED_TRANSACTIONS.map((t) => ({
  id: `je-${t.id}`,
  organization_id: t.organization_id,
  transaction_id: t.id,
  entry_date: t.transaction_date,
  description: t.description,
  created_at: NOW,
}));

function entryFor(transactionId: string): SeedJournalEntry {
  return SEED_JOURNAL_ENTRIES.find((e) => e.transaction_id === transactionId)!;
}

const SEED_JOURNAL_LINES: SeedJournalLine[] = SEED_TRANSACTIONS.flatMap((t) => {
  const entry = entryFor(t.id);
  const debitAccountId = t.transaction_type === "cash_in" || t.transaction_type === "owner_deposit"
    ? t.cash_account_id
    : t.counter_account_id;
  const creditAccountId = t.transaction_type === "cash_in" || t.transaction_type === "owner_deposit"
    ? t.counter_account_id
    : t.cash_account_id;
  return [
    { id: `jl-${t.id}-d`, organization_id: t.organization_id, journal_entry_id: entry.id, account_id: debitAccountId, debit_idr: t.amount_idr, credit_idr: 0, created_at: NOW },
    { id: `jl-${t.id}-c`, organization_id: t.organization_id, journal_entry_id: entry.id, account_id: creditAccountId, debit_idr: 0, credit_idr: t.amount_idr, created_at: NOW },
  ];
});

// ── Runtime mirrors (reset per fixture) ────────────────────────

let users: SeedUser[] = [];
let orgs: SeedOrganization[] = [];
let memberships: SeedMembership[] = [];
let sessions: SeedSession[] = [];
let accounts: SeedAccount[] = [];
let transactions: SeedTransaction[] = [];
let journalEntries: SeedJournalEntry[] = [];
let journalLines: SeedJournalLine[] = [];
let insertedUsers: SeedUser[] = [];
let oauthAccounts: SeedOAuthAccount[] = [];
let products: SeedProduct[] = [];
let stockMovements: SeedStockMovement[] = [];

function resetRuntime(): void {
  users = SEED_USERS.map((u) => ({ ...u }));
  orgs = SEED_ORGS.map((o) => ({ ...o }));
  memberships = SEED_MEMBERSHIPS.map((m) => ({ ...m }));
  sessions = SEED_SESSIONS.map((s) => ({ ...s }));
  accounts = SEED_ACCOUNTS.map((a) => ({ ...a }));
  transactions = SEED_TRANSACTIONS.map((t) => ({ ...t }));
  journalEntries = SEED_JOURNAL_ENTRIES.map((e) => ({ ...e }));
  journalLines = SEED_JOURNAL_LINES.map((l) => ({ ...l }));
  insertedUsers = [];
  oauthAccounts = [];
  products = SEED_PRODUCTS.map((p) => ({ ...p }));
  stockMovements = [];
}

function findUserByIdOrEmail(value: string): SeedUser | undefined {
  return users.find((u) => u.id === value || u.email === value) ??
    insertedUsers.find((u) => u.id === value || u.email === value);
}

function allTransactions(orgId?: string): SeedTransaction[] {
  return orgId ? transactions.filter((t) => t.organization_id === orgId) : transactions;
}

function allAccounts(orgId?: string): SeedAccount[] {
  return orgId ? accounts.filter((a) => a.organization_id === orgId) : accounts;
}

function accountById(orgId: string, accountId: string): SeedAccount | undefined {
  return allAccounts(orgId).find((a) => a.id === accountId);
}

function allProducts(orgId?: string): SeedProduct[] {
  return orgId ? products.filter((p) => p.organization_id === orgId) : products;
}

function productById(orgId: string, productId: string): SeedProduct | undefined {
  return allProducts(orgId).find((p) => p.id === productId);
}

/**
 * Cermin filter/sort daftar produk (dipakai handleFirst utk count dan
 * handleAll utk list): aktif, search nama/kode, stok, urutan.
 */
function selectProducts(sql: string, values: unknown[], orgId: string): SeedProduct[] {
  const s = sql.toLowerCase();
  let result = allProducts(orgId);
  let idx = 1;
  if (s.includes("is_active = 0")) {
    result = result.filter((p) => p.is_active === 0);
  } else if (s.includes("is_active = 1")) {
    result = result.filter((p) => p.is_active === 1);
  }
  if (s.includes("like")) {
    const needle = String(values[idx]).replaceAll("%", "").toLowerCase();
    idx += 2;
    result = result.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle),
    );
  }
  if (s.includes("current_stock_milli = 0")) {
    result = result.filter((p) => p.current_stock_milli === 0);
  } else if (s.includes("current_stock_milli <= ?")) {
    const bound = Number(values[idx]);
    idx += 1;
    result = result.filter((p) => p.current_stock_milli > 0 && p.current_stock_milli <= bound);
  } else if (s.includes("current_stock_milli > 0")) {
    result = result.filter((p) => p.current_stock_milli > 0);
  }
  const byName = (a: SeedProduct, b: SeedProduct) =>
    a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
  if (s.includes("order by name")) result = [...result].sort(byName);
  else if (s.includes("current_stock_milli asc")) {
    result = [...result].sort(
      (a, b) => a.current_stock_milli - b.current_stock_milli || byName(a, b),
    );
  } else if (s.includes("average_cost_minor) desc")) {
    result = [...result].sort(
      (a, b) =>
        b.current_stock_milli * b.average_cost_minor - a.current_stock_milli * a.average_cost_minor ||
        byName(a, b),
    );
  } else result = [...result].sort((a, b) => a.code.localeCompare(b.code));
  if (s.includes("limit")) {
    const limit = Number(values[idx]);
    const offset = Number(values[idx + 1] ?? 0);
    result = result.slice(offset, offset + limit);
  }
  return result;
}

function orgTransactions(orgId: string): SeedTransaction[] {
  return allTransactions(orgId);
}

function toTransactionReadback(t: SeedTransaction, orgId: string): Record<string, unknown> {
  const cash = accountById(orgId, t.cash_account_id);
  const counter = accountById(orgId, t.counter_account_id);
  return {
    id: t.id,
    organization_id: t.organization_id,
    transaction_number: t.transaction_number,
    transaction_type: t.transaction_type,
    transaction_date: t.transaction_date,
    description: t.description,
    status: t.status,
    amount_idr: t.amount_idr,
    cash_account_id: t.cash_account_id,
    counter_account_id: t.counter_account_id,
    created_by: t.created_by,
    created_at: t.created_at,
    voided_at: t.voided_at,
    void_reason: t.void_reason,
    cash_bank_account: cash?.name ?? null,
    counter_account: counter?.name ?? null,
  };
}

function norm(sql: string): string {
  return sql.replace(/\s+/g, " ");
}

/**
 * Apply the org-scoped transaction filters (date range, type, status, search)
 * that listTransactions/countTransactions build, in builder order. `prefix` is
 * "t." for aliased selects and "" for plain COUNT(*) queries; filter values
 * start at index 1 (index 0 is the organization id).
 */
function applyTransactionFilters(
  source: SeedTransaction[],
  s: string,
  values: unknown[],
  prefix: string,
): SeedTransaction[] {
  let result = source;
  let vi = 1;
  if (s.includes(`${prefix}transaction_date >= ?`)) {
    const from = values[vi++] as string;
    result = result.filter((t) => t.transaction_date >= from);
  }
  if (s.includes(`${prefix}transaction_date <= ?`)) {
    const to = values[vi++] as string;
    result = result.filter((t) => t.transaction_date <= to);
  }
  if (s.includes(`${prefix}transaction_type = ?`)) {
    const type = values[vi++] as SeedTransaction["transaction_type"];
    result = result.filter((t) => t.transaction_type === type);
  }
  if (s.includes(`${prefix}status = ?`)) {
    const status = values[vi++] as "posted" | "voided";
    result = result.filter((t) => t.status === status);
  }
  if (s.includes(`lower(${prefix}description) LIKE ?`)) {
    // description LIKE + number LIKE share the same value
    const search = (values[vi] as string).replaceAll("%", "").toLowerCase();
    result = result.filter(
      (t) =>
        t.description.toLowerCase().includes(search) ||
        t.transaction_number.toLowerCase().includes(search),
    );
  }
  return result;
}

// ── In-memory query handlers ───────────────────────────────────

function handleFirst(sql: string, values: unknown[]): unknown { // NOSONAR:S3776 - fake-D1 dispatcher mirrors real query shapes
  const s = norm(sql);

  // Users (login/register lookups)
  if (s.includes("FROM users WHERE")) {
    const user = findUserByIdOrEmail(values[0] as string);
    return user ? { ...user } : null;
  }

  // Sessions (getSessionByToken + rotation re-read)
  if (s.includes("FROM sessions s") && s.includes("JOIN users u")) {
    if (s.includes("s.token_hash = ?") || s.includes("s.previous_token_hash = ?")) {
      // Service shape (with grace): [current, idleCutoff, tokenHash, tokenHash, graceCurrent]
      // Ad-hoc helper shape (WHERE s.token_hash = ?): [tokenHash, current]
      const hasGrace = s.includes("s.previous_token_hash = ?");
      const tokenHash = (hasGrace ? values[2] : values[0]) as string;
      const current = Number(hasGrace ? values[0] : (values[1] ?? Date.now()));
      // Ad-hoc helper queries ([tokenHash, current]) never filter by idle time.
      const idleCutoff = hasGrace ? Number(values[1]) : 0;
      const graceCurrent = hasGrace ? Number(values[4]) : 0;
      const session = sessions.find(
        (x) =>
          x.revoked_at === null &&
          x.expires_at > current &&
          (x.last_used_at ?? 0) >= idleCutoff &&
          (x.token_hash === tokenHash ||
            (hasGrace &&
              x.previous_token_hash === tokenHash &&
              x.previous_token_expires_at != null &&
              x.previous_token_expires_at > graceCurrent)),
      );
      if (!session) return null;
      const user = findUserByIdOrEmail(session.user_id);
      if (!user) return null;
      return {
        session_id: session.id,
        user_id: session.user_id,
        expires_at: session.expires_at,
        current_organization_id: session.current_organization_id,
        email: user.email,
        full_name: user.full_name,
        last_used_at: session.last_used_at,
        last_rotated_at: session.last_rotated_at,
        created_at: session.created_at,
        previous_token_hash: session.previous_token_hash,
        previous_token_expires_at: session.previous_token_expires_at,
      };
    }
    if (s.includes("WHERE s.id = ?") && s.includes("s.user_id = ?")) {
      const session = sessions.find(
        (x) => x.id === values[0] && x.user_id === values[1] && x.revoked_at === null,
      );
      if (!session) return null;
      const current = Number(values[2]);
      if (session.expires_at <= current) return null;
      const user = findUserByIdOrEmail(session.user_id);
      if (!user) return null;
      return {
        session_id: session.id,
        user_id: session.user_id,
        expires_at: session.expires_at,
        current_organization_id: session.current_organization_id,
        email: user.email,
        full_name: user.full_name,
        last_used_at: session.last_used_at,
      };
    }
    return null;
  }

  // Google OAuth lookups (must run before the plain FROM users WHERE branch)
  if (s.includes("FROM oauth_accounts oa") && s.includes("JOIN users u")) {
    const account = oauthAccounts.find(
      (x) => x.provider === "google" && x.provider_account_id === (values[0] as string),
    );
    if (!account) return null;
    const user = findUserByIdOrEmail(account.user_id);
    if (!user) return null;
    return { id: user.id, email: user.email, full_name: user.full_name, status: user.status };
  }
  if (s.includes("FROM oauth_accounts") && s.includes("provider_account_id = ?")) {
    const account = oauthAccounts.find(
      (x) => x.provider === "google" && x.provider_account_id === (values[0] as string),
    );
    return account ? { ...account } : null;
  }

  // Organizations
  if (s.includes("FROM organizations")) {
    return orgs.find((o) => o.id === values[0]) ?? null;
  }

  // Memberships (plain lookups, e.g. register integration test)
  if (s.includes("FROM memberships") && !s.includes("JOIN organizations")) {
    // Lookup by user_id only (e.g. google-oauth org resolution)
    if (s.includes("WHERE user_id = ?") && values.length === 1) {
      const member = memberships.find((m) => m.user_id === (values[0] as string));
      return member ? { organization_id: member.organization_id, role: member.role } : null;
    }
    const member = memberships.find(
      (m) =>
        m.organization_id === values[0] && m.user_id === values[1],
    );
    return member ? { role: member.role } : null;
  }

  // Memberships (getCurrentOrganization)
  if (s.includes("FROM memberships m") && s.includes("JOIN organizations o")) {
    const userId = values[0] as string;
    const orgId = s.includes("m.organization_id = ?") ? (values[1] as string) : undefined;
    const member = memberships.find(
      (m) => m.user_id === userId && (!orgId || m.organization_id === orgId),
    );
    if (!member) return null;
    const org = orgs.find((o) => o.id === member.organization_id);
    if (!org) return null;
    return {
      organization_id: org.id,
      organization_name: org.name,
      base_currency: org.base_currency,
      organization_status: org.status,
      created_at: org.created_at,
      member_id: member.id,
      user_id: member.user_id,
      role: member.role,
    };
  }

  // Accounts
  if (s.includes("FROM accounts")) {
    // Name-taken lookups: SELECT id FROM accounts WHERE organization_id = ? AND name = ? [AND id != ?]
    if (s.includes("name = ?")) {
      const orgId = values[0] as string;
      const name = values[1] as string;
      const excludeId = s.includes("id != ?") ? (values[2] as string) : undefined;
      const account = allAccounts(orgId).find((a) => a.name === name && a.id !== excludeId);
      return account ? { id: account.id } : null;
    }
    // nextCashBankCode collision check: SELECT id FROM accounts WHERE organization_id = ? AND code = ?
    if (s.includes("code = ?") && !s.includes("account_kind")) {
      const orgId = values[0] as string;
      const code = values[1] as string;
      const account = allAccounts(orgId).find((a) => a.code === code);
      return account ? { id: account.id } : null;
    }
    // MAX(CAST(code AS INTEGER)) - next cash/bank code (atau blok klasifikasi bila ada LIKE prefix).
    if (s.includes("MAX(CAST(code AS INTEGER))")) {
      const orgId = values[0] as string;
      const prefix = s.includes("code LIKE ?") ? String(values[1]).replaceAll("%", "") : null;
      const maxCode = allAccounts(orgId)
        .filter((a) => a.account_subtype !== null || (prefix !== null && a.code.startsWith(prefix)))
        .reduce((max, a) => Math.max(max, Number(a.code)), 0);
      return { max_code: maxCode };
    }
    // getAccountByKind: ... WHERE organization_id = ? AND account_kind = ? AND is_active = 1
    if (s.includes("account_kind = ?")) {
      const orgId = values[0] as string;
      const kind = values[1] as "inventory" | "cogs";
      const account = allAccounts(orgId).find(
        (a) => a.account_kind === kind && a.is_active === 1,
      );
      return account ? { ...account } : null;
    }
    // getAccount: SELECT ... FROM accounts WHERE id = ? AND organization_id = ?
    if (s.includes("WHERE id = ?") && s.includes("organization_id = ?")) {
      const account = allAccounts().find(
        (a) => a.id === values[0] && a.organization_id === values[1],
      );
      return account ? { ...account } : null;
    }
    return null;
  }

  // Products
  if (s.includes("FROM products")) {
    // Count daftar produk (listProductsPage total).
    if (s.includes("products:count")) {
      const orgId = values[0] as string;
      return { total: selectProducts(s, values, orgId).length };
    }
    // Name-taken lookups
    if (s.includes("name = ?")) {
      const orgId = values[0] as string;
      const name = values[1] as string;
      const excludeId = s.includes("id != ?") ? (values[2] as string) : undefined;
      const product = allProducts(orgId).find((p) => p.name === name && p.id !== excludeId);
      return product ? { id: product.id } : null;
    }
    // nextProductCode: MAX(CAST(SUBSTR(code, 5) AS INTEGER)) ... code LIKE 'PRD-%'
    if (s.includes("SUBSTR(code, 5)")) {
      const orgId = values[0] as string;
      const maxSeq = allProducts(orgId)
        .filter((p) => p.code.startsWith("PRD-"))
        .reduce((max, p) => Math.max(max, Number(p.code.slice(4)) || 0), 0);
      return { max_seq: maxSeq };
    }
    // Code collision check: SELECT id FROM products WHERE organization_id = ? AND code = ?
    if (s.includes("code = ?")) {
      const orgId = values[0] as string;
      const code = values[1] as string;
      const product = allProducts(orgId).find((p) => p.code === code);
      return product ? { id: product.id } : null;
    }
    // getProduct: SELECT ... WHERE id = ? AND organization_id = ?
    if (s.includes("WHERE id = ?") && s.includes("organization_id = ?")) {
      const product = allProducts().find(
        (p) => p.id === values[0] && p.organization_id === values[1],
      );
      return product ? { ...product } : null;
    }
    return null;
  }

  // productIsUsed: COUNT(*) FROM stock_movements sm JOIN transactions t ...
  if (s.includes("COUNT(*)") && s.includes("FROM stock_movements sm")) {
    const orgId = values[0] as string;
    const productId = values[1] as string;
    const count = stockMovements.filter(
      (m) => m.organization_id === orgId && m.product_id === productId &&
        transactions.find((t) => t.id === m.transaction_id)?.status === "posted",
    ).length;
    return { c: count };
  }

  // Count queries (must run before the FROM transactions block, which
  // returns null for queries it does not recognize)
  if (s.includes("COUNT(*)") && s.includes("FROM transactions") && s.includes("cash_account_id = ?")) {
    // accountIsUsed: transactions referencing a specific account
    const orgId = values[0] as string;
    const cashAccountId = values[1] as string;
    const counterAccountId = values[2] as string;
    return {
      c: orgTransactions(orgId).filter(
        (t) => t.cash_account_id === cashAccountId || t.counter_account_id === counterAccountId,
      ).length,
    };
  }
  if (s.includes("COUNT(*)") && s.includes("FROM transactions")) {
    const orgId = values[0] as string;
    const result = applyTransactionFilters(orgTransactions(orgId), s, values, "");
    return { c: result.length };
  }

  // Transactions
  if (s.includes("FROM transactions")) {
    // Idempotency lookup
    if (s.includes("t.idempotency_key = ?") || s.includes("idempotency_key = ?")) {
      const orgId = values[0] as string;
      const key = values[1] as string;
      const txn = transactions.find(
        (t) => t.organization_id === orgId && t.idempotency_key === key,
      );
      return txn ? { id: txn.id, transaction_number: txn.transaction_number, idempotency_payload_hash: txn.idempotency_payload_hash ?? null } : null;
    }
    // Unique transaction number check
    if (s.includes("transaction_number = ?")) {
      const txn = transactions.find((t) => t.transaction_number === values[0]);
      return txn ? { id: txn.id } : null;
    }
    // Void lookup: SELECT id, status, transaction_number ...
    if (s.includes("WHERE id = ?") && s.includes("organization_id = ?") && !s.includes("LEFT JOIN")) {
      const txn = transactions.find(
        (t) => t.id === values[0] && t.organization_id === values[1],
      );
      return txn ? { id: txn.id, status: txn.status, transaction_number: txn.transaction_number } : null;
    }
    // getTransaction (LEFT JOIN readback)
    if (s.includes("LEFT JOIN") && s.includes("t.id = ?")) {
      const txn = transactions.find(
        (t) => t.id === values[0] && t.organization_id === values[1],
      );
      return txn ? toTransactionReadback(txn, txn.organization_id) : null;
    }
    return null;
  }

  // Journal entries
  if (s.includes("FROM journal_entries")) {
    const txnId = values[0] as string;
    const orgId = values[1] as string;
    const entry = journalEntries.find(
      (e) => e.transaction_id === txnId && e.organization_id === orgId,
    );
    return entry ? { id: entry.id } : null;
  }

  return null;
}

function handleAll(sql: string, values: unknown[]): unknown[] { // NOSONAR:S3776 - fake-D1 dispatcher mirrors real query shapes
  const s = norm(sql);

  // Plain memberships lookup (e.g. counting orgs per user)
  if (s.includes("FROM memberships") && !s.includes("JOIN")) {
    return memberships
      .filter((m) => m.user_id === (values[0] as string))
      .map((m) => ({ organization_id: m.organization_id }));
  }

  // Transactions list / export (LEFT JOIN readbacks)
  if (s.includes("FROM transactions t") && s.includes("LEFT JOIN accounts")) {
    const orgId = values[0] as string;
    const result = applyTransactionFilters(orgTransactions(orgId), s, values, "t.");
    return result.map((t) => toTransactionReadback(t, orgId));
  }

  // Account list (plain SELECT ... FROM accounts WHERE organization_id = ?)
  if (s.includes("FROM accounts") && !s.includes("FROM accounts a") && !s.includes("ORDER BY")) {
    const orgId = values[0] as string;
    return allAccounts(orgId).map((a) => ({ ...a }));
  }

  // Account list
  if (s.includes("FROM accounts a") || (s.includes("FROM accounts") && s.includes("ORDER BY a.code"))) {
    const orgId = values[0] as string;
    let result = allAccounts(orgId);
    if (s.includes("a.is_active = 1")) result = result.filter((a) => a.is_active === 1);
    if (s.includes("a.account_subtype = ?")) {
      const subtype = values[1] as "cash" | "bank";
      result = result.filter((a) => a.account_subtype === subtype);
    }
    if (s.includes("a.account_class = ?")) {
      const accountClass = values[1] as SeedAccount["account_class"];
      result = result.filter((a) => a.account_class === accountClass);
    }
    return result.map((a) => ({ ...a }));
  }

  // Balances per account (dashboard + accounts list): grouped debit/credit
  if (s.includes("FROM journal_lines jl") && s.includes("GROUP BY jl.account_id")) {
    const orgId = values[0] as string;
    const totals = journalTotalsByAccount(orgId, {});
    return [...totals.entries()].map(([account_id, { debit, credit }]) => ({
      account_id,
      debit,
      credit,
    }));
  }

  // Report account totals (profit-loss + balance-sheet)
  if (s.includes("FROM journal_lines jl") && s.includes("GROUP BY a.id")) {
    const orgId = values[0] as string;
    const toDate = values[1] as string;
    const fromDate = s.includes("t.transaction_date >= ?") ? (values[2] as string) : null;
    const totals = journalTotalsByAccount(orgId, { toDate, fromDate });
    return [...totals.entries()].map(([account_id, { debit, credit }]) => {
      const account = allAccounts(orgId).find((a) => a.id === account_id);
      return {
        id: account_id,
        code: account?.code ?? "",
        name: account?.name ?? "",
        account_class: account?.account_class ?? "",
        debit,
        credit,
      };
    });
  }

  // General ledger (getGeneralLedger): per-account chronological journal
  // lines with a running balance computed over all lines up to `to`, then
  // sliced from `from` (so opening balances carry into the visible range).
  if (s.includes("ledger_base") && s.includes("running_balance_idr")) {
    const orgId = values[0] as string;
    const toDate = values[1] as string;
    const hasAccount = s.includes("jl.account_id = ?");
    const accountId = hasAccount ? (values[2] as string) : undefined;
    const fromDate = (hasAccount ? values[3] : values[2]) as string;

    interface GlLine {
      account_id: string;
      code: string;
      name: string;
      account_class: SeedAccount["account_class"];
      entry_date: string;
      created_at: number;
      transaction_id: string;
      transaction_number: string;
      description: string;
      status: "posted" | "voided";
      void_reason: string | null;
      debit_idr: number;
      credit_idr: number;
    }
    const rows: GlLine[] = [];
    for (const line of journalLines.filter((l) => l.organization_id === orgId)) {
      const entry = journalEntries.find((e) => e.id === line.journal_entry_id);
      const txn = entry ? transactions.find((t) => t.id === entry.transaction_id) : null;
      // Cermin WHERE SQL: baris void tampil sebagai jejak audit.
      if (txn?.status !== "posted" && txn?.status !== "voided") continue;
      if (txn.transaction_date > toDate) continue;
      if (accountId && line.account_id !== accountId) continue;
      const account = allAccounts(orgId).find((a) => a.id === line.account_id);
      if (!account) continue;
      rows.push({
        account_id: line.account_id,
        code: account.code,
        name: account.name,
        account_class: account.account_class,
        entry_date: txn.transaction_date,
        created_at: txn.created_at,
        transaction_id: txn.id,
        transaction_number: txn.transaction_number,
        description: txn.description,
        status: txn.status as "posted" | "voided",
        void_reason: txn.void_reason,
        debit_idr: line.debit_idr,
        credit_idr: line.credit_idr,
      });
    }
    const sortLines = (a: GlLine, b: GlLine): number =>
      a.entry_date.localeCompare(b.entry_date)
      || a.created_at - b.created_at
      || a.transaction_id.localeCompare(b.transaction_id)
      || a.account_id.localeCompare(b.account_id);

    const byAccount = new Map<string, GlLine[]>();
    for (const row of rows) {
      const list = byAccount.get(row.account_id) ?? [];
      list.push(row);
      byAccount.set(row.account_id, list);
    }
    const result: Record<string, unknown>[] = [];
    const accountIds = [...byAccount.keys()].sort((x, y) => {
      const ax = allAccounts(orgId).find((a) => a.id === x);
      const ay = allAccounts(orgId).find((a) => a.id === y);
      return Number(ax?.code ?? 0) - Number(ay?.code ?? 0) || x.localeCompare(y);
    });
    for (const id of accountIds) {
      const list = byAccount.get(id)!.sort(sortLines);
      let running = 0;
      for (const line of list) {
        const debitNormal = line.account_class === "asset" || line.account_class === "expense";
        // Cermin CASE SQL: baris void berkontribusi nol ke saldo berjalan.
        if (line.status !== "voided") {
          running += debitNormal
            ? line.debit_idr - line.credit_idr
            : line.credit_idr - line.debit_idr;
        }
        if (line.entry_date < fromDate) continue;
        result.push({
          account_id: line.account_id,
          account_code: line.code,
          account_name: line.name,
          account_class: line.account_class,
          entry_date: line.entry_date,
          transaction_id: line.transaction_id,
          transaction_number: line.transaction_number,
          description: line.description,
          entry_status: line.status,
          void_reason: line.void_reason,
          // SQL output aliases (debit/credit), not source column names.
          debit: line.debit_idr,
          credit: line.credit_idr,
          running_balance_idr: running,
        });
      }
    }
    return result;
  }

  // Products list (legacy tanpa marker + baru bermarker products:list).
  if (s.includes("FROM products") && !s.includes("JOIN")) {
    const orgId = values[0] as string;
    if (!s.includes("products:list") && !s.includes("products:count")) {
      let result = allProducts(orgId);
      if (s.includes("is_active = 1")) result = result.filter((p) => p.is_active === 1);
      return result.map((p) => ({ ...p }));
    }
    return selectProducts(s, values, orgId).map((p) => ({ ...p }));
  }

  // Transaction items (getTransaction detail): stock_movements JOIN products
  if (s.includes("FROM stock_movements sm") && s.includes("JOIN products p") && s.includes("sm.transaction_id = ?")) {
    const orgId = values[0] as string;
    const transactionId = values[1] as string;
    return stockMovements
      .filter((m) => m.organization_id === orgId && m.transaction_id === transactionId)
      .map((m) => {
        const product = productById(orgId, m.product_id);
        return {
          product_id: m.product_id,
          product_code: product?.code ?? "",
          product_name: product?.name ?? "",
          quantity_milli: m.quantity_milli,
          unit_cost_minor: m.unit_cost_minor,
          cost_total_idr: m.cost_total_idr,
        };
      });
  }

  // Void: SELECT product_id FROM stock_movements WHERE organization_id = ? AND transaction_id = ?
  if (s.includes("SELECT product_id FROM stock_movements") && s.includes("transaction_id = ?")) {
    const orgId = values[0] as string;
    const transactionId = values[1] as string;
    return stockMovements
      .filter((m) => m.organization_id === orgId && m.transaction_id === transactionId)
      .map((m) => ({ product_id: m.product_id }));
  }

  // movementsForProduct (recalc): stock_movements JOIN transactions, posted only
  if (s.includes("FROM stock_movements sm") && s.includes("JOIN transactions t") && s.includes("sm.product_id = ?")) {
    const orgId = values[0] as string;
    const productId = values[1] as string;
    return stockMovements
      .filter(
        (m) => m.organization_id === orgId && m.product_id === productId &&
          transactions.find((t) => t.id === m.transaction_id)?.status === "posted",
      )
      .map((m) => ({ ...m }));
  }

  // getStockMovementReport: mutasi + transaksi + produk, posted only, sisa berjalan.
  if (s.includes("report:stock-movements")) {
    const orgId = values[0] as string;
    const toDate = values[1] as string;
    const productId = values.length > 2 ? (values[2] as string) : undefined;
    const lines = [];
    for (const m of stockMovements) {
      if (m.organization_id !== orgId) continue;
      if (productId && m.product_id !== productId) continue;
      const txn = transactions.find((t) => t.id === m.transaction_id);
      if (txn?.status !== "posted") continue;
      if (txn.transaction_date > toDate) continue;
      const product = products.find((p) => p.id === m.product_id);
      if (!product) continue;
      lines.push({
        product_id: product.id,
        product_name: product.name,
        unit: product.unit,
        entry_date: txn.transaction_date,
        transaction_id: txn.id,
        transaction_number: txn.transaction_number,
        transaction_type: txn.transaction_type,
        description: txn.description,
        quantity_milli: m.quantity_milli,
        unit_cost_minor: m.unit_cost_minor,
        created_at: m.created_at,
      });
    }
    // Cermin ORDER BY SQL: nama produk, id, tanggal, created_at, urutan sisip.
    lines.sort(
      (a, b) =>
        a.product_name.localeCompare(b.product_name) ||
        a.product_id.localeCompare(b.product_id) ||
        a.entry_date.localeCompare(b.entry_date) ||
        a.created_at - b.created_at,
    );
    return lines;
  }

  // Dashboard cash flow: SELECT transaction_type, SUM(amount_idr) ... GROUP BY transaction_type
  if (s.includes("GROUP BY transaction_type") && s.includes("SUM(amount_idr)")) {
    const orgId = values[0] as string;
    const fromDate = values[1] as string;
    const toDate = values[2] as string;
    const totals = new Map<string, number>();
    for (const t of transactions.filter(
      (tx) => tx.organization_id === orgId && tx.status === "posted" &&
        tx.transaction_date >= fromDate && tx.transaction_date <= toDate,
    )) {
      totals.set(t.transaction_type, (totals.get(t.transaction_type) ?? 0) + t.amount_idr);
    }
    return [...totals.entries()].map(([transaction_type, total]) => ({ transaction_type, total }));
  }

  return [];
}

/** Sum debits/credits of posted journal lines per account (date-filterable). */
function journalTotalsByAccount(
  orgId: string,
  opts: { toDate?: string; fromDate?: string | null },
): Map<string, { debit: number; credit: number }> {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of journalLines.filter((l) => l.organization_id === orgId)) {
    const entry = journalEntries.find((e) => e.id === line.journal_entry_id);
    const txn = entry ? transactions.find((t) => t.id === entry.transaction_id) : null;
    if (!txn) continue;
    if (txn.status !== "posted") continue;
    if (opts.toDate && txn.transaction_date > opts.toDate) continue;
    if (opts.fromDate && txn.transaction_date < opts.fromDate) continue;
    const bucket = totals.get(line.account_id) ?? { debit: 0, credit: 0 };
    bucket.debit += line.debit_idr;
    bucket.credit += line.credit_idr;
    totals.set(line.account_id, bucket);
  }
  return totals;
}

function handleRun(sql: string, values: unknown[]): D1Result { // NOSONAR:S3776 - fake-D1 dispatcher mirrors real query shapes
  const s = norm(sql);

  if (s.includes("INSERT INTO users")) {
    insertedUsers.push({
      id: values[0] as string,
      email: values[1] as string,
      password_hash: values[2] as string,
      full_name: values[3] as string,
      status: "active",
      created_at: Number(values[5]),
      updated_at: Number(values[6]),
    });
  }

  if (s.includes("INSERT INTO oauth_accounts")) {
    // VALUES (?, ?, 'google', ?, ?, ?, ?): id, user_id, provider_account_id, email, created_at, updated_at
    oauthAccounts.push({
      id: values[0] as string,
      user_id: values[1] as string,
      provider: "google",
      provider_account_id: values[2] as string,
      email: (values[3] as string | null) ?? null,
      created_at: Number(values[4]),
      updated_at: Number(values[5]),
    });
  }

  if (s.includes("INSERT INTO sessions")) {
    // hasOrg shape: (id, user_id, token_hash, ip, ua, current_organization_id, expires_at, last_used_at, created_at)
    // no-org shape: (id, user_id, token_hash, ip, ua, expires_at, last_used_at, created_at)
    const hasOrg = values.length === 9;
    sessions.push({
      id: values[0] as string,
      user_id: values[1] as string,
      token_hash: values[2] as string,
      current_organization_id: hasOrg ? (values[5] as string | null) : null,
      expires_at: Number(values[hasOrg ? 6 : 5]),
      last_used_at: Number(values[hasOrg ? 7 : 6]),
      last_rotated_at: null,
      created_at: Number(values[hasOrg ? 8 : 7]),
      revoked_at: null,
      previous_token_hash: null,
      previous_token_expires_at: null,
    });
  }

  if (s.includes("INSERT INTO accounts")) {
    if (values.length === 10) {
      // createDefaultAccounts (with account_kind): is_active hardcoded as 1
      // values: id, org, code, name, class, subtype, kind, is_system, created, updated
      accounts.push({
        id: values[0] as string,
        organization_id: values[1] as string,
        code: values[2] as string,
        name: values[3] as string,
        account_class: values[4] as SeedAccount["account_class"],
        account_subtype: values[5] as "cash" | "bank" | null,
        account_kind: values[6] as "inventory" | "cogs" | null,
        is_system: Number(values[7]),
        is_active: 1,
        created_at: Number(values[8]),
        updated_at: Number(values[9]),
      });
    } else if (s.includes("account_kind")) {
      // createAccount (non-kas): class dinamis, subtype+kind NULL
      // values: id, org, code, name, class, created, updated
      accounts.push({
        id: values[0] as string,
        organization_id: values[1] as string,
        code: values[2] as string,
        name: values[3] as string,
        account_class: values[4] as SeedAccount["account_class"],
        account_subtype: null,
        account_kind: null,
        is_system: 0,
        is_active: 1,
        created_at: Number(values[5]),
        updated_at: Number(values[6]),
      });
    } else {
      // createCashBankAccount: 'asset', 0, 1 hardcoded in SQL
      // values: id, org, code, name, subtype, created, updated
      accounts.push({
        id: values[0] as string,
        organization_id: values[1] as string,
        code: values[2] as string,
        name: values[3] as string,
        account_class: "asset",
        account_subtype: values[4] as "cash" | "bank",
        account_kind: null,
        is_system: 0,
        is_active: 1,
        created_at: Number(values[5]),
        updated_at: Number(values[6]),
      });
    }
  }

  if (s.includes("INSERT INTO products")) {
    // values: id, org, code, name, unit, selling_price_idr, created, updated
    products.push({
      id: values[0] as string,
      organization_id: values[1] as string,
      code: values[2] as string,
      name: values[3] as string,
      unit: values[4] as string,
      selling_price_idr: Number(values[5]),
      current_stock_milli: 0,
      average_cost_minor: 0,
      is_active: 1,
      created_at: Number(values[6]),
      updated_at: Number(values[7]),
    });
  }

  if (s.includes("UPDATE products SET")) {
    // Guarded stock/WAC shape:
    //   SET current_stock_milli=?, average_cost_minor=?, updated_at=? WHERE id=? AND organization_id=? AND current_stock_milli=? AND average_cost_minor=?
    if (s.includes("AND current_stock_milli = ?")) {
      const product = productById(values[4] as string, values[3] as string);
      const matched = product?.current_stock_milli === Number(values[5]) &&
        product?.average_cost_minor === Number(values[6]);
      if (matched && product) {
        product.current_stock_milli = Number(values[0]);
        product.average_cost_minor = Number(values[1]);
        product.updated_at = Number(values[2]);
      }
      // Jujur seperti D1 asli: guard meleset -> changes 0 agar retry
      // optimistic-locking produksi bisa diuji lewat fake ini.
      return {
        success: true,
        results: [],
        meta: {
          duration: 0,
          size_after: 0,
          rows_read: 0,
          rows_written: matched ? 1 : 0,
          last_row_id: 0,
          changed_db: true,
          changes: matched ? 1 : 0,
        },
      };
    } else if (s.includes("current_stock_milli = ?")) {
      // recalculateProductCosts shape (no guard):
      //   SET current_stock_milli=?, average_cost_minor=?, updated_at=? WHERE id=? AND organization_id=?
      const product = productById(values[4] as string, values[3] as string);
      if (product) {
        product.current_stock_milli = Number(values[0]);
        product.average_cost_minor = Number(values[1]);
        product.updated_at = Number(values[2]);
      }
    } else {
      // Patch shape: ... updated_at=? WHERE id=? AND organization_id=?
      const product = productById(values.at(-1) as string, values.at(-2) as string);
      if (product) {
        let vi = 0;
        if (s.includes("name = ?")) product.name = values[vi++] as string;
        if (s.includes("unit = ?")) product.unit = values[vi++] as string;
        if (s.includes("selling_price_idr = ?")) product.selling_price_idr = Number(values[vi++]);
        if (s.includes("is_active = ?")) product.is_active = Number(values[vi++]);
        product.updated_at = Number(values[vi]);
      }
    }
  }

  if (s.includes("INSERT INTO stock_movements")) {
    // values: id, org, transaction_id, product_id, quantity_milli, unit_cost_minor, cost_total_idr, created_at
    stockMovements.push({
      id: values[0] as string,
      organization_id: values[1] as string,
      transaction_id: values[2] as string,
      product_id: values[3] as string,
      quantity_milli: Number(values[4]),
      unit_cost_minor: Number(values[5]),
      cost_total_idr: Number(values[6]),
      created_at: Number(values[7]),
    });
  }

  if (s.includes("INSERT INTO organizations")) {
    orgs.push({
      id: values[0] as string,
      name: values[1] as string,
      base_currency: values[2] as string,
      status: "active",
      created_at: Number(values[3]),
      updated_at: Number(values[4]),
    });
  }

  if (s.includes("INSERT INTO memberships")) {
    // Columns: (id, user_id, organization_id, role, created_at)
    memberships.push({
      id: values[0] as string,
      user_id: values[1] as string,
      organization_id: values[2] as string,
      role: "owner",
      created_at: Number(values[3]),
    });
  }

  if (s.includes("UPDATE organizations SET")) {
    const org = orgs.find((o) => o.id === values.at(-1));
    if (org) {
      if (s.includes("name = ?")) org.name = values[0] as string;
      org.updated_at = Number(values.at(-2));
    }
  }

  if (s.includes("UPDATE accounts SET")) {
    const account = accounts.find(
      (a) =>
        a.id === values.at(-2) &&
        a.organization_id === values.at(-1),
    );
    if (account) {
      let vi = 0;
      if (s.includes("name = ?")) account.name = values[vi++] as string;
      // eslint-disable-next-line no-useless-assignment -- final index read
      if (s.includes("is_active = ?")) account.is_active = Number(values[vi++]);
      account.updated_at = Number(values.at(-3));
    }
  }

  if (s.includes("INSERT INTO transactions")) {
    transactions.push({
      id: values[0] as string,
      organization_id: values[1] as string,
      transaction_number: values[2] as string,
      transaction_type: values[3] as SeedTransaction["transaction_type"],
      transaction_date: values[4] as string,
      description: values[5] as string,
      status: "posted",
      amount_idr: Number(values[6]),
      cash_account_id: values[7] as string,
      counter_account_id: values[8] as string,
      idempotency_key: values[9] as string,
      // values[13] is idempotency_payload_hash when the service INSERT
      // includes it (appended last so positions 0..12 stay stable).
      idempotency_payload_hash: (values[13] as string | undefined) ?? null,
      created_by: values[10] as string,
      created_at: Number(values[11]),
      voided_at: null,
      void_reason: null,
      updated_at: Number(values[12]),
    });
  }

  if (s.includes("INSERT INTO journal_entries")) {
    journalEntries.push({
      id: values[0] as string,
      organization_id: values[1] as string,
      transaction_id: values[2] as string,
      entry_date: values[3] as string,
      description: values[4] as string,
      created_at: Number(values[5]),
    });
  }

  if (s.includes("INSERT INTO journal_lines")) {
    journalLines.push({
      id: values[0] as string,
      organization_id: values[1] as string,
      journal_entry_id: values[2] as string,
      account_id: values[3] as string,
      debit_idr: Number(values[4]),
      credit_idr: Number(values[5]),
      created_at: Number(values[6]),
    });
  }

  if (s.includes("UPDATE transactions SET status")) {
    const txn = transactions.find((t) => t.id === values[3]);
    if (txn?.status === "posted") {
      txn.status = "voided";
      txn.voided_at = Number(values[0]);
      txn.void_reason = (values[1] as string | null) ?? null;
    }
  }

  if (s.includes("UPDATE sessions SET") && s.includes("revoked_at = ?")) {
    // Revoke by token hash: (revokedAt, tokenHash)
    const session = sessions.find((x) => x.token_hash === values[1] && x.revoked_at === null);
    if (session) session.revoked_at = Number(values[0]);
  }

  if (s.includes("UPDATE sessions SET") && s.includes("token_hash = ?")) {
    // Token rotation: (newHash, current, current, oldHash, graceExp, id, oldHash)
    const session = sessions.find((x) => x.id === values[5]);
    if (session && session.token_hash === values[6]) {
      session.token_hash = values[0] as string;
      session.last_used_at = Number(values[1]);
      session.last_rotated_at = Number(values[2]);
      session.previous_token_hash = (values[3] as string | null) ?? null;
      session.previous_token_expires_at = Number(values[4] ?? 0) || null;
    }
  }

  if (s.includes("UPDATE sessions SET") && !s.includes("token_hash = ?")) {
    const session = sessions.find((x) => x.id === values[1]);
    if (session) {
      if (s.includes("current_organization_id = ?")) {
        session.current_organization_id = values[0] as string | null;
      }
      if (s.includes("last_used_at = ?")) {
        session.last_used_at = Number(values[0]);
      }
    }
  }

  return {
    success: true,
    results: [],
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 1,
      last_row_id: 0,
      changed_db: true,
      changes: 1,
    },
  };
}

// ── Public fixtures API ─────────────────────────────────────────

export interface SeedFixture {
  db: FakeD1Database;
  tokens: {
    ownerA: string;
    ownerB: string;
    ownerEmpty: string;
  };
  password: string;
  pepper: string;
}

async function buildSessions(): Promise<void> {
  const tokens = ["session-token-orga-000001", "session-token-orgb-000001", "session-token-empty-000001"];
  const now = Date.now();
  const hashes = await Promise.all(tokens.map((t) => hashToken(t)));
  SEED_SESSIONS[0].token_hash = hashes[0];
  SEED_SESSIONS[1].token_hash = hashes[1];
  SEED_SESSIONS[2].token_hash = hashes[2];
  for (const session of SEED_SESSIONS) {
    session.expires_at = now + 7 * 86400000; // valid for a week from load
    session.last_used_at = now - 1000;
    session.created_at = now - 86400000; // 1 day old → no token rotation
  }
  const passwordHash = await hashPassword(TEST_PASSWORD, TEST_PEPPER);
  SEED_USERS[0].password_hash = passwordHash;
}

/** Await once at module load (vitest ESM supports top-level await). */
await buildSessions();

/**
 * Build a FakeD1Database with the complete MVP seed schema + data.
 * Each call resets the runtime mirrors, isolating tests from each other.
 */
export function createSeedFixtures(): SeedFixture {
  resetRuntime();
  const db = new FakeD1Database({
    first: handleFirst,
    all: handleAll,
    run: handleRun,
  });

  return {
    db: db as unknown as FakeD1Database,
    tokens: {
      ownerA: "session-token-orga-000001",
      ownerB: "session-token-orgb-000001",
      ownerEmpty: "session-token-empty-000001",
    },
    password: TEST_PASSWORD,
    pepper: TEST_PEPPER,
  };
}

/**
 * Age a fixture session's rotation timestamps so the next getSessionByToken
 * call with its (plaintext) token triggers a token rotation. Used by the
 * session rotation / grace-window tests. Call after createSeedFixtures().
 */
export async function ageFixtureSessionToken(token: string, ageMs: number): Promise<void> {
  const tokenHash = await hashToken(token);
  const session = sessions.find((x) => x.token_hash === tokenHash);
  if (!session) return;
  const target = Date.now() - ageMs;
  session.created_at = target;
  session.last_rotated_at = target;
}

/**
 * Force the rotation grace window of the given (plaintext) OLD token to
 * expire, so tests can assert the previous hash stops being accepted.
 */
export async function expireFixtureSessionGrace(token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  const session = sessions.find((x) => x.previous_token_hash === tokenHash);
  if (session) session.previous_token_expires_at = Date.now() - 1000;
}

/** Unbalanced journal fixture for validation tests. */
export const INVALID_DATA = {
  unbalancedJournal: {
    lines: [
      { accountId: "acct-invalid-001", debitIdr: 500000, creditIdr: 0 },
      { accountId: "acct-invalid-002", debitIdr: 0, creditIdr: 300000 },
    ],
  },
  negativeAmount: { amountIdr: -1000 },
} as const;