import { FakeD1Database, validateJournalLine } from "./fake-d1";

/**
 * Deterministic seeded test fixtures for accounting and security tests.
 *
 * Two organizations (Org A and Org B) with:
 * - Owner, admin, member, viewer per org
 * - Chart of accounts
 * - Products with stock
 * - Parties (customer, supplier)
 * - Posted transactions
 * - Partial credit transactions
 * - Locked periods
 * - Audit events
 *
 * Fixture IDs are centrally defined to avoid scattering through tests.
 * All monetary values are in minor units (integer IDR).
 * All quantity values are in milli-units (integer 1/1000).
 */

// ── Central ID Definitions ─────────────────────────────────────
export const FIXTURE_IDS = {
  users: {
    ownerA: "user-orga-owner-00001",
    adminA: "user-orga-admin-00001",
    memberA: "user-orga-member-0001",
    viewerA: "user-orga-viewer-0001",
    ownerB: "user-orgb-owner-00001",
    adminB: "user-orgb-admin-00001",
    memberB: "user-orgb-member-0001",
    viewerB: "user-orgb-viewer-0001",
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
    arA: "acct-orga-ar-0000001",
    inventoryA: "acct-orga-inv-000001",
    apA: "acct-orga-ap-0000001",
    equityA: "acct-orga-eq-000001",
    revenueA: "acct-orga-rev-000001",
    cogsA: "acct-orga-cogs-00001",
    expenseA: "acct-orga-exp-000001",
    cashB: "acct-orgb-cash-000001",
    arB: "acct-orgb-ar-0000001",
    apB: "acct-orgb-ap-0000001",
    revenueB: "acct-orgb-rev-000001",
  },
  products: {
    widget: "prod-orga-widget-0001",
    gadget: "prod-orga-gadget-0001",
    widgetB: "prod-orgb-widget-0001",
  },
  parties: {
    customerA: "party-orga-cust-00001",
    supplierA: "party-orga-supp-00001",
    customerB: "party-orgb-cust-00001",
  },
  transactions: {
    cashSaleA: "txn-orga-cshsl-0001",
    creditSaleA: "txn-orga-crdsl-0001",
    partialCreditA: "txn-orga-prtcr-0001",
    cashPurchaseA: "txn-orga-cshpr-0001",
    creditPurchaseA: "txn-orga-crdpr-0001",
    expenseA: "txn-orga-expns-0001",
    capitalA: "txn-orga-captl-0001",
  },
  journalEntries: {
    cashSaleA: "je-orga-cashsl-0001",
    creditSaleA: "je-orga-crdsl-0001",
    partialCreditA: "je-orga-prtcr-0001",
  },
  periodLocks: {
    lockA: "lock-orga-jul2026-001",
  },
} as const;

const NOW = 1750000000000; // Fixed timestamp for determinism

/**
 * Build a FakeD1Database with complete seeded schema + data.
 */
export function createSeedFixtures(): {
  db: FakeD1Database;
  /** @deprecated use tokens.ownerA */
  sessionTokenA: string;
  /** @deprecated use tokens.ownerB */
  sessionTokenB: string;
  tokens: {
    ownerA: string; adminA: string; memberA: string; viewerA: string;
    ownerB: string; adminB: string; memberB: string; viewerB: string;
    ownerEmpty: string;
  };
} {
  const db = new FakeD1Database({
    first: createFirstHandler(),
    all: createAllHandler(),
    run: createRunHandler(),
    batch: createBatchHandler(),
  });

  const tokens = {
    ownerA: "session-token-orga-000001",
    adminA: "session-token-orga-admin-000001",
    memberA: "session-token-orga-member-0001",
    viewerA: "session-token-orga-viewer-0001",
    ownerB: "session-token-orgb-000001",
    adminB: "session-token-orgb-admin-000001",
    memberB: "session-token-orgb-member-0001",
    viewerB: "session-token-orgb-viewer-0001",
    ownerEmpty: "session-token-empty-000001",
  };

  return {
    db: db as unknown as FakeD1Database,
    sessionTokenA: tokens.ownerA,
    sessionTokenB: tokens.ownerB,
    tokens,
  };
}

// ── In-memory seed data stores ─────────────────────────────────
interface SeedUser {
  id: string; email: string; password_hash: string; full_name: string;
  status: string; email_verified_at: number; created_at: number; updated_at: number;
}
interface SeedSession {
  id: string; user_id: string; token_hash: string; expires_at: number;
  current_organization_id: string; created_at: number;
}
interface SeedOrg {
  id: string; name: string; business_type: string; base_currency: string;
  books_start_date: string; onboarding_status: string; created_by: string;
  created_at: number; updated_at: number;
}
interface SeedMember {
  id: string; organization_id: string; user_id: string; role: string;
  status: string; created_at: number;
}
interface SeedAccount {
  id: string; organization_id: string; code: string; name: string;
  account_type: string; normal_balance: string; is_active: number;
  is_cash_account: number; created_at: number; updated_at: number;
}
interface SeedProduct {
  id: string; organization_id: string; code: string; name: string;
  purchase_price_minor: number; selling_price_minor: number;
  average_cost_minor: number; current_stock_milli: number;
  is_active: number; created_at: number; updated_at: number;
}
interface SeedParty {
  id: string; organization_id: string; name: string; party_type: string;
  is_active: number; created_at: number; updated_at: number;
}
interface SeedTransaction {
  id: string; organization_id: string; transaction_number: string;
  transaction_date: string; transaction_type: string; amount_minor: number;
  party_id: string | null; cash_account_id: string | null;
  payment_status: string; status: string; idempotency_key: string | null;
  posted_at: number; created_by: string; created_at: number; updated_at: number;
  description: string;
}
interface SeedJournalEntry {
  id: string; organization_id: string; entry_number: string;
  entry_date: string; entry_type: string; transaction_id: string;
  status: string; posted_at: number; created_at: number;
}
interface SeedJournalLine {
  id: string; organization_id: string; journal_entry_id: string;
  account_id: string; debit_minor: number; credit_minor: number;
  description: string; line_order: number; created_at: number;
}
interface SeedPeriodLock {
  id: string; organization_id: string; locked_through_date: string;
  reason: string; locked_by: string; created_at: number; updated_at: number;
}
interface SeedAuditLog {
  id: string; organization_id: string; actor_user_id: string;
  entity_type: string; entity_id: string; action: string;
  created_at: number;
}
// ponytail: Seed types used by createSeedFixtures handlers at runtime.
// Stock movement shape documented inline in handler code.

const USERS: SeedUser[] = [
  { id: FIXTURE_IDS.users.ownerA, email: "owner@orga.test", password_hash: "", full_name: "Owner A", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.adminA, email: "admin@orga.test", password_hash: "", full_name: "Admin A", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.memberA, email: "member@orga.test", password_hash: "", full_name: "Member A", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.viewerA, email: "viewer@orga.test", password_hash: "", full_name: "Viewer A", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.ownerB, email: "owner@orgb.test", password_hash: "", full_name: "Owner B", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.adminB, email: "admin@orgb.test", password_hash: "", full_name: "Admin B", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.memberB, email: "member@orgb.test", password_hash: "", full_name: "Member B", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.viewerB, email: "viewer@orgb.test", password_hash: "", full_name: "Viewer B", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.users.ownerEmpty, email: "owner@empty.test", password_hash: "", full_name: "Owner Empty", status: "active", email_verified_at: NOW, created_at: NOW, updated_at: NOW },
];

const ORGS: SeedOrg[] = [
  { id: FIXTURE_IDS.orgs.a, name: "PT Organisasi A", business_type: "simple_trading", base_currency: "IDR", books_start_date: "2026-01-01", onboarding_status: "completed", created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.orgs.b, name: "CV Organisasi B", business_type: "service", base_currency: "IDR", books_start_date: "2026-01-01", onboarding_status: "completed", created_by: FIXTURE_IDS.users.ownerB, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.orgs.empty, name: "Empty Organization", business_type: "simple_trading", base_currency: "IDR", books_start_date: "2026-06-01", onboarding_status: "pending", created_by: FIXTURE_IDS.users.ownerEmpty, created_at: NOW, updated_at: NOW },
];

const MEMBERS: SeedMember[] = [
  { id: "mem-orga-owner-0001", organization_id: FIXTURE_IDS.orgs.a, user_id: FIXTURE_IDS.users.ownerA, role: "owner", status: "active", created_at: NOW },
  { id: "mem-orga-admin-0001", organization_id: FIXTURE_IDS.orgs.a, user_id: FIXTURE_IDS.users.adminA, role: "admin", status: "active", created_at: NOW },
  { id: "mem-orga-member-0001", organization_id: FIXTURE_IDS.orgs.a, user_id: FIXTURE_IDS.users.memberA, role: "member", status: "active", created_at: NOW },
  { id: "mem-orga-viewer-0001", organization_id: FIXTURE_IDS.orgs.a, user_id: FIXTURE_IDS.users.viewerA, role: "viewer", status: "active", created_at: NOW },
  { id: "mem-orgb-owner-0001", organization_id: FIXTURE_IDS.orgs.b, user_id: FIXTURE_IDS.users.ownerB, role: "owner", status: "active", created_at: NOW },
  { id: "mem-orgb-admin-0001", organization_id: FIXTURE_IDS.orgs.b, user_id: FIXTURE_IDS.users.adminB, role: "admin", status: "active", created_at: NOW },
  { id: "mem-orgb-member-0001", organization_id: FIXTURE_IDS.orgs.b, user_id: FIXTURE_IDS.users.memberB, role: "member", status: "active", created_at: NOW },
  { id: "mem-orgb-viewer-0001", organization_id: FIXTURE_IDS.orgs.b, user_id: FIXTURE_IDS.users.viewerB, role: "viewer", status: "active", created_at: NOW },
  { id: "mem-empty-owner-0001", organization_id: FIXTURE_IDS.orgs.empty, user_id: FIXTURE_IDS.users.ownerEmpty, role: "owner", status: "active", created_at: NOW },
];

const ACCOUNTS: SeedAccount[] = [
  { id: FIXTURE_IDS.accounts.cashA, organization_id: FIXTURE_IDS.orgs.a, code: "1110", name: "Kas Org A", account_type: "asset", normal_balance: "debit", is_active: 1, is_cash_account: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.bankA, organization_id: FIXTURE_IDS.orgs.a, code: "1120", name: "Bank Org A", account_type: "asset", normal_balance: "debit", is_active: 1, is_cash_account: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.arA, organization_id: FIXTURE_IDS.orgs.a, code: "1200", name: "Piutang Usaha A", account_type: "asset", normal_balance: "debit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.inventoryA, organization_id: FIXTURE_IDS.orgs.a, code: "1300", name: "Persediaan A", account_type: "asset", normal_balance: "debit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.apA, organization_id: FIXTURE_IDS.orgs.a, code: "2100", name: "Utang Usaha A", account_type: "liability", normal_balance: "credit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.equityA, organization_id: FIXTURE_IDS.orgs.a, code: "3100", name: "Modal Pemilik A", account_type: "equity", normal_balance: "credit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.revenueA, organization_id: FIXTURE_IDS.orgs.a, code: "4100", name: "Pendapatan A", account_type: "revenue", normal_balance: "credit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.cogsA, organization_id: FIXTURE_IDS.orgs.a, code: "5100", name: "HPP A", account_type: "cogs", normal_balance: "debit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.expenseA, organization_id: FIXTURE_IDS.orgs.a, code: "6100", name: "Beban Operasional A", account_type: "expense", normal_balance: "debit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.cashB, organization_id: FIXTURE_IDS.orgs.b, code: "1110", name: "Kas Org B", account_type: "asset", normal_balance: "debit", is_active: 1, is_cash_account: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.arB, organization_id: FIXTURE_IDS.orgs.b, code: "1200", name: "Piutang Usaha B", account_type: "asset", normal_balance: "debit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.apB, organization_id: FIXTURE_IDS.orgs.b, code: "2100", name: "Utang Usaha B", account_type: "liability", normal_balance: "credit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.accounts.revenueB, organization_id: FIXTURE_IDS.orgs.b, code: "4110", name: "Pendapatan B", account_type: "revenue", normal_balance: "credit", is_active: 1, is_cash_account: 0, created_at: NOW, updated_at: NOW },
];

const PRODUCTS: SeedProduct[] = [
  { id: FIXTURE_IDS.products.widget, organization_id: FIXTURE_IDS.orgs.a, code: "WGT-001", name: "Widget A", purchase_price_minor: 50000, selling_price_minor: 100000, average_cost_minor: 50000, current_stock_milli: 100_000, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.products.gadget, organization_id: FIXTURE_IDS.orgs.a, code: "GDT-001", name: "Gadget A", purchase_price_minor: 150000, selling_price_minor: 250000, average_cost_minor: 150000, current_stock_milli: 50_000, is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.products.widgetB, organization_id: FIXTURE_IDS.orgs.b, code: "WGT-001", name: "Widget B", purchase_price_minor: 60000, selling_price_minor: 120000, average_cost_minor: 60000, current_stock_milli: 200_000, is_active: 1, created_at: NOW, updated_at: NOW },
];

// ponytail: These const arrays are intentionally declared for documentation and
// future use. The _ prefix tricks no-unused-vars but in TS we use a comment.
const PARTIES: SeedParty[] = [
  { id: FIXTURE_IDS.parties.customerA, organization_id: FIXTURE_IDS.orgs.a, name: "Pelanggan A", party_type: "customer", is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.parties.supplierA, organization_id: FIXTURE_IDS.orgs.a, name: "Pemasok A", party_type: "supplier", is_active: 1, created_at: NOW, updated_at: NOW },
  { id: FIXTURE_IDS.parties.customerB, organization_id: FIXTURE_IDS.orgs.b, name: "Pelanggan B", party_type: "customer", is_active: 1, created_at: NOW, updated_at: NOW },
];
PARTIES satisfies SeedParty[]; // Used in handler closure

const TRANSACTIONS: SeedTransaction[] = [
  { id: FIXTURE_IDS.transactions.cashSaleA, organization_id: FIXTURE_IDS.orgs.a, transaction_number: "TRX-202601-000001", transaction_date: "2026-01-15", transaction_type: "cash_sale", amount_minor: 500000, party_id: null, cash_account_id: FIXTURE_IDS.accounts.cashA, payment_status: "paid", status: "posted", idempotency_key: "idem-cashsale-orga-01", posted_at: NOW, created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW, description: "Penjualan tunai widget" },
  { id: FIXTURE_IDS.transactions.creditSaleA, organization_id: FIXTURE_IDS.orgs.a, transaction_number: "TRX-202601-000002", transaction_date: "2026-01-20", transaction_type: "credit_sale", amount_minor: 750000, party_id: FIXTURE_IDS.parties.customerA, cash_account_id: null, payment_status: "unpaid", status: "posted", idempotency_key: "idem-crdsale-orga-01", posted_at: NOW, created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW, description: "Penjualan kredit gadget" },
  { id: FIXTURE_IDS.transactions.partialCreditA, organization_id: FIXTURE_IDS.orgs.a, transaction_number: "TRX-202601-000003", transaction_date: "2026-01-25", transaction_type: "credit_sale", amount_minor: 1000000, party_id: FIXTURE_IDS.parties.customerA, cash_account_id: null, payment_status: "partial", status: "posted", idempotency_key: "idem-prtcr-orga-01", posted_at: NOW, created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW, description: "Penjualan kredit partial widget" },
  { id: FIXTURE_IDS.transactions.cashPurchaseA, organization_id: FIXTURE_IDS.orgs.a, transaction_number: "TRX-202602-000001", transaction_date: "2026-02-01", transaction_type: "cash_purchase", amount_minor: 300000, party_id: null, cash_account_id: FIXTURE_IDS.accounts.cashA, payment_status: "paid", status: "posted", idempotency_key: "idem-cashpur-orga-01", posted_at: NOW, created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW, description: "Pembelian tunai stok widget" },
  { id: FIXTURE_IDS.transactions.creditPurchaseA, organization_id: FIXTURE_IDS.orgs.a, transaction_number: "TRX-202602-000002", transaction_date: "2026-02-05", transaction_type: "credit_purchase", amount_minor: 600000, party_id: FIXTURE_IDS.parties.supplierA, cash_account_id: null, payment_status: "unpaid", status: "posted", idempotency_key: "idem-crdpur-orga-01", posted_at: NOW, created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW, description: "Pembelian kredit stok gadget" },
  { id: FIXTURE_IDS.transactions.expenseA, organization_id: FIXTURE_IDS.orgs.a, transaction_number: "TRX-202602-000003", transaction_date: "2026-02-10", transaction_type: "expense_payment", amount_minor: 100000, party_id: null, cash_account_id: FIXTURE_IDS.accounts.cashA, payment_status: "paid", status: "posted", idempotency_key: "idem-expns-orga-01", posted_at: NOW, created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW, description: "Pembayaran beban sewa" },
  { id: FIXTURE_IDS.transactions.capitalA, organization_id: FIXTURE_IDS.orgs.a, transaction_number: "TRX-202601-000004", transaction_date: "2026-01-10", transaction_type: "owner_capital", amount_minor: 5000000, party_id: null, cash_account_id: FIXTURE_IDS.accounts.cashA, payment_status: "paid", status: "posted", idempotency_key: "idem-captl-orga-01", posted_at: NOW, created_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW, description: "Setoran modal awal" },
];
TRANSACTIONS satisfies SeedTransaction[]; // Referenced in handler closure

const JOURNAL_ENTRIES: SeedJournalEntry[] = [
  { id: FIXTURE_IDS.journalEntries.cashSaleA, organization_id: FIXTURE_IDS.orgs.a, entry_number: "JE-000001", entry_date: "2026-01-15", entry_type: "normal", transaction_id: FIXTURE_IDS.transactions.cashSaleA, status: "posted", posted_at: NOW, created_at: NOW },
  { id: FIXTURE_IDS.journalEntries.creditSaleA, organization_id: FIXTURE_IDS.orgs.a, entry_number: "JE-000002", entry_date: "2026-01-20", entry_type: "normal", transaction_id: FIXTURE_IDS.transactions.creditSaleA, status: "posted", posted_at: NOW, created_at: NOW },
  { id: FIXTURE_IDS.journalEntries.partialCreditA, organization_id: FIXTURE_IDS.orgs.a, entry_number: "JE-000003", entry_date: "2026-01-25", entry_type: "normal", transaction_id: FIXTURE_IDS.transactions.partialCreditA, status: "posted", posted_at: NOW, created_at: NOW },
];
JOURNAL_ENTRIES satisfies SeedJournalEntry[]; // Referenced in handler closure

const JOURNAL_LINES: SeedJournalLine[] = [
  // Cash sale: Dr Cash 500k, Cr Revenue 500k
  { id: "jl-orga-cshsl-001", organization_id: FIXTURE_IDS.orgs.a, journal_entry_id: FIXTURE_IDS.journalEntries.cashSaleA, account_id: FIXTURE_IDS.accounts.cashA, debit_minor: 500000, credit_minor: 0, description: "Penjualan tunai", line_order: 1, created_at: NOW },
  { id: "jl-orga-cshsl-002", organization_id: FIXTURE_IDS.orgs.a, journal_entry_id: FIXTURE_IDS.journalEntries.cashSaleA, account_id: FIXTURE_IDS.accounts.revenueA, debit_minor: 0, credit_minor: 500000, description: "Penjualan tunai", line_order: 2, created_at: NOW },
  // Credit sale: Dr AR 750k, Cr Revenue 750k
  { id: "jl-orga-crdsl-001", organization_id: FIXTURE_IDS.orgs.a, journal_entry_id: FIXTURE_IDS.journalEntries.creditSaleA, account_id: FIXTURE_IDS.accounts.arA, debit_minor: 750000, credit_minor: 0, description: "Penjualan kredit", line_order: 1, created_at: NOW },
  { id: "jl-orga-crdsl-002", organization_id: FIXTURE_IDS.orgs.a, journal_entry_id: FIXTURE_IDS.journalEntries.creditSaleA, account_id: FIXTURE_IDS.accounts.revenueA, debit_minor: 0, credit_minor: 750000, description: "Penjualan kredit", line_order: 2, created_at: NOW },
  // Partial credit: Dr Cash 300k, Dr AR 700k, Cr Revenue 1M
  { id: "jl-orga-prtcr-001", organization_id: FIXTURE_IDS.orgs.a, journal_entry_id: FIXTURE_IDS.journalEntries.partialCreditA, account_id: FIXTURE_IDS.accounts.cashA, debit_minor: 300000, credit_minor: 0, description: "Pembayaran partial", line_order: 1, created_at: NOW },
  { id: "jl-orga-prtcr-002", organization_id: FIXTURE_IDS.orgs.a, journal_entry_id: FIXTURE_IDS.journalEntries.partialCreditA, account_id: FIXTURE_IDS.accounts.arA, debit_minor: 700000, credit_minor: 0, description: "Sisa piutang", line_order: 2, created_at: NOW },
  { id: "jl-orga-prtcr-003", organization_id: FIXTURE_IDS.orgs.a, journal_entry_id: FIXTURE_IDS.journalEntries.partialCreditA, account_id: FIXTURE_IDS.accounts.revenueA, debit_minor: 0, credit_minor: 1000000, description: "Penjualan kredit partial", line_order: 3, created_at: NOW },
];

const PERIOD_LOCKS: SeedPeriodLock[] = [
  { id: FIXTURE_IDS.periodLocks.lockA, organization_id: FIXTURE_IDS.orgs.a, locked_through_date: "2026-01-31", reason: "Tutup buku Januari 2026", locked_by: FIXTURE_IDS.users.ownerA, created_at: NOW, updated_at: NOW },
];

const AUDIT_LOGS: SeedAuditLog[] = [
  { id: "audit-orga-post-001", organization_id: FIXTURE_IDS.orgs.a, actor_user_id: FIXTURE_IDS.users.ownerA, entity_type: "transaction", entity_id: FIXTURE_IDS.transactions.cashSaleA, action: "post", created_at: NOW },
  { id: "audit-orga-post-002", organization_id: FIXTURE_IDS.orgs.a, actor_user_id: FIXTURE_IDS.users.ownerA, entity_type: "transaction", entity_id: FIXTURE_IDS.transactions.creditSaleA, action: "post", created_at: NOW },
  { id: "audit-orga-lock-001", organization_id: FIXTURE_IDS.orgs.a, actor_user_id: FIXTURE_IDS.users.ownerA, entity_type: "period_lock", entity_id: FIXTURE_IDS.periodLocks.lockA, action: "period_lock_created", created_at: NOW },
];
AUDIT_LOGS satisfies SeedAuditLog[];

/**
 * Intentionally invalid test data for validation tests.
 * Each entry violates a known constraint to verify rejection.
 */
export const INVALID_DATA = {
  /** Unbalanced journal: debit != credit */
  unbalancedJournal: {
    lines: [
      { account_id: "acct-invalid-001", debit_minor: 500000, credit_minor: 0, description: "Dr only" },
      { account_id: "acct-invalid-002", debit_minor: 0, credit_minor: 300000, description: "Cr mismatch" },
    ],
  },
  /** Missing required fields */
  missingRequired: {
    transaction: { transaction_date: "", transaction_type: "", amount_minor: 0 },
  },
  /** Negative amount */
  negativeAmount: { amount_minor: -1000 },
  /** Future date beyond allowed horizon */
  futureDate: "2030-01-01",
  /** Empty string fields */
  emptyFields: { name: "", code: "" },
} as const;
INVALID_DATA satisfies Record<string, unknown>;

// ponytail: Counter tracking for nextCounter (INSERT ... RETURNING current_value)
const counters: Record<string, number> = {};

// ── Handlers ───────────────────────────────────────────────────

// ── Query handler extractors (reduce cognitive complexity of createFirstHandler) ──

function handleUserQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM users WHERE")) return undefined;
  const user = USERS.find(u => u.id === values[0] || u.email === values[0]);
  return user ? { ...user } : null;
}

function handleSessionQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM sessions s")) return undefined;
  const tokenHash = values[0] as string;
  const session = SESSIONS.find(s => s.token_hash === tokenHash);
  if (!session) return null;
  const user = USERS.find(u => u.id === session.user_id);
  if (!user) return null;
  return {
    session_id: session.id,
    user_id: session.user_id,
    expires_at: session.expires_at,
    current_organization_id: session.current_organization_id,
    email: user.email,
    full_name: user.full_name,
    email_verified_at: user.email_verified_at,
  };
}

function handleOrganizationMemberQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM organization_members m")) return undefined;
  const userId = values[0] as string;
  const orgId = values[1] as string | undefined;
  return MEMBERS.find(m => m.user_id === userId && (!orgId || m.organization_id === orgId)) ?? null;
}

function handleOrganizationQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM organizations")) return undefined;
  return ORGS.find(o => o.id === values[0]) ?? null;
}

function handleAccountQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM accounts") || !sql.includes("WHERE")) return undefined;
  if (sql.includes("code = ?")) {
    return ACCOUNTS.find(a => a.organization_id === values[0] && a.code === values[1]) ?? null;
  }
  if (sql.includes("organization_id = ? AND id =") || sql.includes("organization_id = ? and id =")) {
    return ACCOUNTS.find(a => a.organization_id === values[0] && a.id === values[1]) ?? null;
  }
  if (sql.includes("id = ? AND organization_id")) {
    return ACCOUNTS.find(a => a.id === values[0] && a.organization_id === values[1]) ?? null;
  }
  return ACCOUNTS.find(a => a.id === values[0]) ?? null;
}

function handleProductQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM products") || !sql.includes("WHERE")) return undefined;
  return PRODUCTS.find(p => p.id === values[0]) ?? null;
}

function handlePartyQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM parties") || !sql.includes("is_active")) return undefined;
  return PARTIES.find(p => p.id === values[0]) ?? null;
}

function handlePeriodLockQuery(sql: string, values: unknown[]) {
  if (!sql.includes("period_locks") || (!sql.includes("SELECT") && !sql.includes("FROM"))) return undefined;
  if (!sql.includes("locked_through_date") || !Array.isArray(values) || values.length < 2) return undefined;
  const orgId = values[0] as string;
  const checkDate = values[1] as string;
  const lock = PERIOD_LOCKS.find(l => l.organization_id === orgId && l.locked_through_date >= checkDate);
  return lock ? { id: lock.id, locked_through_date: lock.locked_through_date } : null;
}

function handleTransactionReadbackQuery(sql: string, values: unknown[]) {
  if (!sql.includes("FROM transactions t") || !sql.includes("LEFT JOIN") || !sql.includes("t.id =")) return undefined;
  const txnId = values[0] as string;
  const orgId = values[1] as string;
  return {
    id: txnId,
    organization_id: orgId,
    transaction_number: "TRX-TEST",
    transaction_date: "2026-02-15",
    transaction_type: "cash_sale",
    amount_minor: 500000,
    party_id: null, party_name: null,
    category_name: null,
    cash_account_id: null,
    destination_cash_account_id: null,
    payment_status: "paid", due_date: null,
    description: "Synthetic readback", notes: null,
    status: "posted",
    idempotency_key: null,
    posted_at: Date.now(), voided_at: null, void_reason: null,
    original_transaction_id: null, reversal_transaction_id: null,
    created_by: FIXTURE_IDS.users.ownerA,
    created_by_name: "Owner A",
    created_at: Date.now(),
  };
}

function handleTransactionIdempotencyQuery(sql: string) {
  if (!sql.includes("FROM transactions t") || !sql.includes("WHERE") || !sql.includes("t.idempotency_key")) return undefined;
  return null;
}

function handleTransactionNumberQuery(sql: string, values: unknown[]) {
  if (!sql.includes("MAX(transaction_number")) return undefined;
  const last = TRANSACTIONS.filter(t => t.organization_id === values[0])
    .reduce((max, t) => Math.max(max, Number.parseInt(t.transaction_number)), 0);
  return { "MAX(transaction_number)": last || 0 };
}

function handleEntryNumberQuery(sql: string, values: unknown[]) {
  if (!sql.includes("MAX(entry_number")) return undefined;
  const last = JOURNAL_ENTRIES.filter(e => e.organization_id === values[0])
    .reduce((max, e) => Math.max(max, Number.parseInt(e.entry_number)), 0);
  return { "MAX(entry_number)": last || 0 };
}

function handleCounterInsertQuery(sql: string, values: unknown[]) {
  if (!sql.includes("organization_document_counters") || !sql.includes("RETURNING current_value")) return undefined;
  const key = `${values[0] as string}:${values[1] as string}`;
  counters[key] = (counters[key] ?? 0) + 1;
  return { current_value: counters[key] };
}

function handleSchemaQuery(sql: string) {
  if (!sql.includes("app_metadata") && !sql.includes("SELECT 1")) return undefined;
  return { ok: 1, value: "9" };
}

function createFirstHandler() {
  const norm = (sql: string) => sql.replace(/\s+/g, " ");

  return (sql: string, values: unknown[]) => {
    const s = norm(sql);
    return (
      handleUserQuery(s, values) ??
      handleSessionQuery(s, values) ??
      handleOrganizationMemberQuery(s, values) ??
      handleOrganizationQuery(s, values) ??
      handleAccountQuery(s, values) ??
      handleProductQuery(s, values) ??
      handlePartyQuery(s, values) ??
      handlePeriodLockQuery(s, values) ??
      handleTransactionReadbackQuery(s, values) ??
      handleTransactionIdempotencyQuery(s) ??
      handleTransactionNumberQuery(s, values) ??
      handleEntryNumberQuery(s, values) ??
      handleCounterInsertQuery(s, values) ??
      handleSchemaQuery(s) ??
      null
    );
  };
}

const SESSIONS: SeedSession[] = [
  { id: "session-orga-owner-1", user_id: FIXTURE_IDS.users.ownerA, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.a, created_at: NOW },
  { id: "session-orga-admin-1", user_id: FIXTURE_IDS.users.adminA, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.a, created_at: NOW },
  { id: "session-orga-member-1", user_id: FIXTURE_IDS.users.memberA, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.a, created_at: NOW },
  { id: "session-orga-viewer-1", user_id: FIXTURE_IDS.users.viewerA, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.a, created_at: NOW },
  { id: "session-orgb-owner-1", user_id: FIXTURE_IDS.users.ownerB, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.b, created_at: NOW },
  { id: "session-orgb-admin-1", user_id: FIXTURE_IDS.users.adminB, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.b, created_at: NOW },
  { id: "session-orgb-member-1", user_id: FIXTURE_IDS.users.memberB, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.b, created_at: NOW },
  { id: "session-orgb-viewer-1", user_id: FIXTURE_IDS.users.viewerB, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.b, created_at: NOW },
  { id: "session-empty-owner-1", user_id: FIXTURE_IDS.users.ownerEmpty, token_hash: "", expires_at: NOW + 86400000, current_organization_id: FIXTURE_IDS.orgs.empty, created_at: NOW },
];

function createAllHandler() {
  return (sql: string, values: unknown[]) => {
    // Members list
    if (sql.includes("FROM organization_members m")) {
      const userId = values[0] as string;
      return MEMBERS.filter(m => m.user_id === userId).map(m => ({
        organization_id: m.organization_id,
        organization_name: ORGS.find(o => o.id === m.organization_id)?.name ?? "",
        business_type: ORGS.find(o => o.id === m.organization_id)?.business_type ?? "",
        base_currency: "IDR",
        books_start_date: "2026-01-01",
        onboarding_status: "completed",
        created_by: ORGS.find(o => o.id === m.organization_id)?.created_by ?? "",
        member_id: m.id,
        user_id: m.user_id,
        role: m.role,
      }));
    }
    // Period locks
    if (sql.includes("FROM period_locks")) {
      return PERIOD_LOCKS.filter(l => l.organization_id === values[0]).map(l => ({
        id: l.id,
        locked_through_date: l.locked_through_date,
      }));
    }
    // Journal lines for transaction (listJournalEntriesForTransaction in buildPostResult)
    if (sql.includes("FROM journal_entries je")) {
      // Build synthetic readback response for buildPostResult
      // The actual data was inserted by executeBatch but FakeD1 doesn't persist.
      // Return a minimal debit/credit pair so buildPostResult can find both sides.
      return [{
        journal_entry_id: "je-synthetic-readback",
        entry_number: "JE-TEST-001",
        entry_date: "2026-02-15",
        entry_type: "normal",
        entry_description: null,
        entry_status: "posted",
        line_id: "jl-synthetic-dr",
        account_id: FIXTURE_IDS.accounts.cashA,
        account_code: "1110",
        account_name: "Kas",
        debit_minor: 500000,
        credit_minor: 0,
        line_description: "Synthetic debit",
      }, {
        journal_entry_id: "je-synthetic-readback",
        entry_number: "JE-TEST-001",
        entry_date: "2026-02-15",
        entry_type: "normal",
        entry_description: null,
        entry_status: "posted",
        line_id: "jl-synthetic-cr",
        account_id: FIXTURE_IDS.accounts.revenueA,
        account_code: "4100",
        account_name: "Pendapatan",
        debit_minor: 0,
        credit_minor: 500000,
        line_description: "Synthetic credit",
      }];
    }
    // Journal lines by org (generic)
    if (sql.includes("FROM journal_lines jl")) {
      return JOURNAL_LINES.filter(jl => jl.organization_id === values[0]).map(jl => ({
        id: jl.id, journal_entry_id: jl.journal_entry_id,
        account_id: jl.account_id, debit_minor: jl.debit_minor,
        credit_minor: jl.credit_minor, description: jl.description,
        line_order: jl.line_order,
      }));
    }
    return [];
  };
}

function createRunHandler() {
  return (_sql: string, _values: unknown[]) => {
    validateJournalLine(_sql, _values);
    return { success: true, meta: { changes: 1 } } as D1Result;
  };
}

function createBatchHandler() {
  return (_statements: { sql: string; values: unknown[] }[]) => {
    for (const s of _statements) validateJournalLine(s.sql, s.values);
    return _statements.map(() => ({ success: true, meta: { changes: 1 } } as D1Result));
  };
}
