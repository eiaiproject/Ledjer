import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst, statement } from "../db/client";
import type { AccountType, NormalBalance, Role } from "../db/schema";
import { badRequest, forbidden } from "../http/errors";
import { logAuthEvent } from "./auth-audit.service";
import {
  setSessionCurrentOrganization,
  type CurrentSessionRow,
} from "./session.service";

export type Permission =
  | "organization:read"
  | "organization:update"
  | "accounts:read"
  | "accounts:write"
  | "products:read"
  | "products:write"
  | "transactions:read"
  | "transactions:create"
  | "transactions:void"
  | "reports:read"
  | "team:read"
  | "team:manage"
  | "exports:create";

export interface PublicOrganization {
  id: string;
  name: string;
  business_type: "service" | "simple_trading";
  base_currency: string;
  books_start_date: string;
  onboarding_status: string;
  created_by: string;
}

export interface PublicOrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  status: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
  can_view_audit_log: boolean;
  can_manage_products: boolean;
}

export interface OrganizationContext {
  organization: PublicOrganization;
  member: PublicOrganizationMember;
}

export interface OrganizationState {
  organization: PublicOrganization | null;
  member: PublicOrganizationMember | null;
  needsOnboarding: boolean;
  error: null;
}

export interface ExtraOpeningBalanceInput {
  accountId?: string;
  amount?: number;
  // frontend format — resolved to accountId by code
  accountCode?: string;
  openingBalance?: number;
  description?: string;
}

export interface CreateOrganizationInput {
  organizationName: string;
  businessType: "service" | "simple_trading";
  booksStartDate: string;
  baseCurrency?: string;
  openingCashBalance?: number;
  extraOpeningBalances?: ExtraOpeningBalanceInput[];
}

interface OrganizationMemberRow {
  organization_id: string;
  organization_name: string;
  business_type: "service" | "simple_trading";
  base_currency: string;
  books_start_date: string;
  onboarding_status: string;
  created_by: string;
  member_id: string;
  user_id: string;
  role: Role;
  status: string;
}

interface DefaultAccount {
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  isLocked: boolean;
  isCashAccount: boolean;
  cashAccountType?: "cash" | "bank" | "qris";
  reportGroup: string;
  accountSubtype?: string;
}

const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  { code: "1110", name: "Kas", accountType: "asset", normalBalance: "debit", isLocked: true, isCashAccount: true, cashAccountType: "cash", reportGroup: "Kas" },
  { code: "1120", name: "Bank", accountType: "asset", normalBalance: "debit", isLocked: true, isCashAccount: true, cashAccountType: "bank", reportGroup: "Bank" },
  { code: "1200", name: "Piutang Usaha", accountType: "asset", normalBalance: "debit", isLocked: true, isCashAccount: false, reportGroup: "Piutang Usaha", accountSubtype: "accounts_receivable" },
  { code: "1300", name: "Persediaan Sederhana", accountType: "asset", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Persediaan" },
  { code: "2100", name: "Utang Usaha", accountType: "liability", normalBalance: "credit", isLocked: true, isCashAccount: false, reportGroup: "Utang Usaha", accountSubtype: "accounts_payable" },
  { code: "2200", name: "Beban Masih Harus Dibayar", accountType: "liability", normalBalance: "credit", isLocked: false, isCashAccount: false, reportGroup: "Beban Belum Dibayar" },
  { code: "3100", name: "Modal Pemilik", accountType: "equity", normalBalance: "credit", isLocked: true, isCashAccount: false, reportGroup: "Modal" },
  { code: "3200", name: "Saldo Awal", accountType: "equity", normalBalance: "credit", isLocked: true, isCashAccount: false, reportGroup: "Saldo Awal" },
  { code: "3300", name: "Prive / Pengambilan Pemilik", accountType: "equity", normalBalance: "debit", isLocked: true, isCashAccount: false, reportGroup: "Prive" },
  { code: "3400", name: "Saldo Laba", accountType: "equity", normalBalance: "credit", isLocked: false, isCashAccount: false, reportGroup: "Saldo Laba" },
  { code: "3500", name: "Laba Tahun Berjalan", accountType: "equity", normalBalance: "credit", isLocked: false, isCashAccount: false, reportGroup: "Laba Berjalan" },
  { code: "4100", name: "Pendapatan Penjualan Barang", accountType: "revenue", normalBalance: "credit", isLocked: false, isCashAccount: false, reportGroup: "Pendapatan" },
  { code: "4200", name: "Pendapatan Jasa", accountType: "revenue", normalBalance: "credit", isLocked: false, isCashAccount: false, reportGroup: "Pendapatan" },
  { code: "5100", name: "HPP / Beban Langsung", accountType: "cogs", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Langsung" },
  { code: "6110", name: "Beban Gaji", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6120", name: "Beban Sewa", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6130", name: "Beban Listrik dan Air", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6140", name: "Beban Internet dan Telepon", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6150", name: "Beban Transportasi", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6160", name: "Beban Iklan dan Promosi", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6170", name: "Beban Perlengkapan", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6180", name: "Beban Software", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "6190", name: "Beban Lain-lain", accountType: "expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Usaha" },
  { code: "7100", name: "Pendapatan Lain-lain", accountType: "other_income", normalBalance: "credit", isLocked: false, isCashAccount: false, reportGroup: "Pendapatan Lain" },
  { code: "8100", name: "Beban Lain-lain", accountType: "other_expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Beban Lain" },
  { code: "8300", name: "Beban Pajak Penghasilan", accountType: "other_expense", normalBalance: "debit", isLocked: false, isCashAccount: false, reportGroup: "Pajak" },
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set([
    "organization:read", "organization:update", "accounts:read", "accounts:write",
    "products:read", "products:write", "transactions:read", "transactions:create",
    "transactions:void", "reports:read", "team:read", "team:manage", "exports:create",
  ]),
  admin: new Set([
    "organization:read", "organization:update", "accounts:read", "accounts:write",
    "products:read", "products:write", "transactions:read", "transactions:create",
    "transactions:void", "reports:read", "team:read", "team:manage", "exports:create",
  ]),
  member: new Set([
    "organization:read", "accounts:read", "products:read",
    "transactions:read", "transactions:create", "reports:read",
  ]),
  viewer: new Set([
    "organization:read", "accounts:read", "products:read",
    "transactions:read", "reports:read",
  ]),
};

export function hasPermission(member: PublicOrganizationMember, permission: Permission): boolean {
  return ROLE_PERMISSIONS[member.role].has(permission);
}

export async function getCurrentOrganization(
  db: D1Database,
  session: CurrentSessionRow,
): Promise<OrganizationState> {
  if (session.current_organization_id) {
    const selected = await getOrganizationContextForUser(
      db, session.user_id, session.current_organization_id,
    );
    if (selected) return toState(selected);
  }

  const fallback = await getOrganizationContextForUser(db, session.user_id);
  if (!fallback) {
    return { organization: null, member: null, needsOnboarding: true, error: null };
  }

  await setSessionCurrentOrganization(db, session.session_id, fallback.organization.id);
  return toState(fallback);
}

export async function listOrganizationsForUser(
  db: D1Database, userId: string,
): Promise<OrganizationContext[]> {
  const rows = await queryAll<OrganizationMemberRow>(
    db, `${organizationMemberSelect()} WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at ASC`, [userId],
  );
  return rows.map(toContext);
}

export async function getOrganizationContextForUser(
  db: D1Database, userId: string, organizationId?: string,
): Promise<OrganizationContext | null> {
  const row = await queryFirst<OrganizationMemberRow>(
    db, `${organizationMemberSelect()} WHERE m.user_id = ? ${organizationId ? "AND m.organization_id = ?" : ""} AND m.status = 'active' ORDER BY m.created_at ASC LIMIT 1`,
    organizationId ? [userId, organizationId] : [userId],
  );
  return row ? toContext(row) : null;
}

export async function setCurrentOrganization(
  db: D1Database, session: CurrentSessionRow, organizationId: string,
): Promise<OrganizationState> {
  const context = await getOrganizationContextForUser(db, session.user_id, organizationId);
  if (!context) throw forbidden("organization_forbidden", "Organization access denied");
  await setSessionCurrentOrganization(db, session.session_id, organizationId);
  return toState(context);
}

export async function createOrganization(
  db: D1Database, session: CurrentSessionRow, input: CreateOrganizationInput,
): Promise<OrganizationState> {
  const current = Date.now();
  const organizationId = generateId();
  const memberId = generateId();
  const organizationName = input.organizationName.trim();

  await execute(
    db,
    `INSERT INTO organizations (id, name, business_type, base_currency, books_start_date, onboarding_status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
    [organizationId, organizationName, input.businessType, input.baseCurrency ?? "IDR", input.booksStartDate, session.user_id, current, current],
  );

  await execute(
    db,
    `INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?)`,
    [memberId, organizationId, session.user_id, current, current, current],
  );

  await createDefaultAccounts(db, organizationId, current);

  // Post opening balances if provided
  if (hasPositiveOpeningBalances(input)) {
    await postOpeningBalances(db, organizationId, session.user_id, input, current);
  }

  await logAuthEvent(db, session.user_id, organizationId, "organization_created", { name: organizationName });
  await setSessionCurrentOrganization(db, session.session_id, organizationId);

  const context = await getOrganizationContextForUser(db, session.user_id, organizationId);
  if (!context) throw badRequest("organization_create_failed", "Organization was not created");
  return toState(context);
}

export function requirePermission(member: PublicOrganizationMember, permission: Permission): void {
  if (!hasPermission(member, permission)) {
    throw forbidden("permission_denied", "Permission denied");
  }
}

function organizationMemberSelect(): string {
  return `SELECT o.id AS organization_id, o.name AS organization_name, o.business_type, o.base_currency, o.books_start_date, o.onboarding_status, o.created_by, m.id AS member_id, m.user_id, m.role, m.status FROM organization_members m JOIN organizations o ON o.id = m.organization_id`;
}

function toContext(row: OrganizationMemberRow): OrganizationContext {
  return {
    organization: {
      id: row.organization_id, name: row.organization_name, business_type: row.business_type,
      base_currency: row.base_currency, books_start_date: row.books_start_date,
      onboarding_status: row.onboarding_status, created_by: row.created_by,
    },
    member: {
      id: row.member_id, organization_id: row.organization_id, user_id: row.user_id,
      role: row.role, status: row.status,
      can_create_transaction: ROLE_PERMISSIONS[row.role].has("transactions:create"),
      can_view_reports: ROLE_PERMISSIONS[row.role].has("reports:read"),
      can_manage_accounts: ROLE_PERMISSIONS[row.role].has("accounts:write"),
      can_void_transaction: ROLE_PERMISSIONS[row.role].has("transactions:void"),
      can_view_audit_log: row.role === "owner" || row.role === "admin",
      can_manage_products: ROLE_PERMISSIONS[row.role].has("products:write"),
    },
  };
}

function toState(context: OrganizationContext): OrganizationState {
  return { ...context, needsOnboarding: context.organization.onboarding_status !== "completed", error: null };
}

function hasPositiveOpeningBalances(input: CreateOrganizationInput): boolean {
  if ((input.openingCashBalance ?? 0) > 0) return true;
  return (input.extraOpeningBalances ?? []).some((b) => (b.amount ?? b.openingBalance ?? 0) > 0);
}

async function postOpeningBalances(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreateOrganizationInput,
  current: number,
): Promise<void> {
  const openingBalanceAccountId = await findAccountIdByCode(db, organizationId, "3200");
  if (!openingBalanceAccountId) {
    throw badRequest("account_not_found", "Opening balance account (3200) not found");
  }

  const statements: D1PreparedStatement[] = [];
  let entriesCount = 1;

  // Post cash/bank opening balance
  const cashAmount = Math.round(input.openingCashBalance ?? 0);
  if (cashAmount > 0) {
    const cashAccountId = await findAccountIdByCode(db, organizationId, "1110");
    if (!cashAccountId) throw badRequest("account_not_found", "Cash account (1110) not found");

    const entryId = generateId();
    const entryNumber = `JE-OB-${String(entriesCount++).padStart(6, "0")}`;

    statements.push(
      statement(db,
        `INSERT INTO journal_entries (id, organization_id, entry_number, entry_date, entry_type, description, status, posted_at, posted_by, created_at) VALUES (?, ?, ?, ?, 'opening_balance', 'Saldo awal kas', 'posted', ?, ?, ?)`,
        [entryId, organizationId, entryNumber, input.booksStartDate, current, userId, current],
      ),
      statement(db,
        `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_minor, credit_minor, description, line_order, created_at) VALUES (?, ?, ?, ?, ?, 0, 'Saldo awal kas', 1, ?)`,
        [generateId(), organizationId, entryId, cashAccountId, cashAmount, current],
      ),
      statement(db,
        `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_minor, credit_minor, description, line_order, created_at) VALUES (?, ?, ?, ?, 0, ?, 'Saldo awal kas', 2, ?)`,
        [generateId(), organizationId, entryId, openingBalanceAccountId, cashAmount, current],
      ),
    );

  }

  // Post extra opening balances
  for (const extra of input.extraOpeningBalances ?? []) {
    const amount = Math.round(extra.amount ?? extra.openingBalance ?? 0);
    if (amount <= 0) continue;

    // Resolve account ID — prefer accountCode from frontend, fall back to accountId
    const accountId = extra.accountId
      ?? (extra.accountCode
        ? await findAccountIdByCode(db, organizationId, extra.accountCode)
        : undefined);
    if (!accountId) continue;

    // Look up normal_balance to determine posting direction
    const account = await queryFirst<{ normal_balance: string }>(
      db,
      `SELECT normal_balance FROM accounts WHERE id = ? AND organization_id = ?`,
      [accountId, organizationId],
    );
    const isCreditNormal = account?.normal_balance === 'credit';
    // For debit-normal accounts: Dr Account / Cr Saldo Awal (3200)
    // For credit-normal accounts: Cr Account / Dr Saldo Awal (3200)
    const accountDebit = isCreditNormal ? 0 : amount;
    const accountCredit = isCreditNormal ? amount : 0;
    const offsetDebit = isCreditNormal ? amount : 0;
    const offsetCredit = isCreditNormal ? 0 : amount;

    const entryId = generateId();
    const entryNumber = `JE-OB-${String(entriesCount++).padStart(6, "0")}`;

    statements.push(
      statement(db,
        `INSERT INTO journal_entries (id, organization_id, entry_number, entry_date, entry_type, description, status, posted_at, posted_by, created_at) VALUES (?, ?, ?, ?, 'opening_balance', ?, 'posted', ?, ?, ?)`,
        [entryId, organizationId, entryNumber, input.booksStartDate, extra.description ?? 'Saldo awal', current, userId, current],
      ),
      statement(db,
        `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_minor, credit_minor, description, line_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [generateId(), organizationId, entryId, accountId, accountDebit, accountCredit, extra.description ?? 'Saldo awal', current],
      ),
      statement(db,
        `INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_minor, credit_minor, description, line_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?)`,
        [generateId(), organizationId, entryId, openingBalanceAccountId, offsetDebit, offsetCredit, extra.description ?? 'Saldo awal', current],
      ),
    );

  }

  if (statements.length > 0) {
    await executeBatch(db, statements);
  }
}

async function findAccountIdByCode(db: D1Database, organizationId: string, code: string): Promise<string | null> {
  const row = await queryFirst<{ id: string }>(
    db, "SELECT id FROM accounts WHERE organization_id = ? AND code = ? LIMIT 1",
    [organizationId, code],
  );
  return row?.id ?? null;
}

async function createDefaultAccounts(
  db: D1Database, organizationId: string, current: number,
): Promise<void> {
  for (const account of DEFAULT_ACCOUNTS) {
    await execute(
      db,
      `INSERT INTO accounts (id, organization_id, code, name, account_type, normal_balance, is_system, is_locked, is_active, is_cash_account, cash_account_type, report_group, account_subtype, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [generateId(), organizationId, account.code, account.name, account.accountType, account.normalBalance, account.isLocked, account.isCashAccount, account.cashAccountType, account.reportGroup, account.accountSubtype ?? null, current, current],
    );
  }
}
