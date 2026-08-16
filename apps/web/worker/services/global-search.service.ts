// ponytail: Global search service for P2.6.
// Searches across all authorized entities within an organization:
// transactions, invoices, parties, products, accounts, team members.
// Results are grouped by entity type with relevance ranking.
// All queries are tenant-scoped (organization_id) to prevent cross-tenant leaks.

import { queryAll } from "../db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResultItem {
  entityType: "transaction" | "invoice" | "party" | "product" | "account" | "member";
  entityId: string;
  label: string;        // Primary display text (name, number, etc.)
  subtitle: string;     // Secondary info (type, amount, description)
  url: string;          // Frontend route
  score: number;        // Relevance score for sorting (higher = more relevant)
}

export interface GlobalSearchResult {
  query: string;
  results: SearchResultItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Search configuration
// ---------------------------------------------------------------------------

/**
 * Search all entities in parallel and return merged, ranked results.
 * Limits per entity type to prevent overwhelming results.
 */
export async function globalSearch(
  db: D1Database,
  organizationId: string,
  query: string,
  limit = 10,
): Promise<GlobalSearchResult> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return { query: trimmed, results: [], total: 0 };
  }

  const searchPattern = `%${trimmed.toLowerCase()}%`;
  const limitPerType = Math.max(limit, 3); // At least 3 per type

  // Run all searches in parallel
  const [
    transactions,
    invoices,
    parties,
    products,
    accounts,
    members,
  ] = await Promise.all([
    searchTransactions(db, organizationId, searchPattern, limitPerType),
    searchInvoices(db, organizationId, searchPattern, limitPerType),
    searchParties(db, organizationId, searchPattern, limitPerType),
    searchProducts(db, organizationId, searchPattern, limitPerType),
    searchAccounts(db, organizationId, searchPattern, limitPerType),
    searchMembers(db, organizationId, searchPattern, limitPerType),
  ]);

  // L-09: Hard limit of 50 total results across all entity types
  const MAX_TOTAL_RESULTS = 50;

  // Merge and sort by score descending
  const allResults = [
    ...transactions,
    ...invoices,
    ...parties,
    ...products,
    ...accounts,
    ...members,
  ].sort((a, b) => b.score - a.score);

  return {
    query: trimmed,
    results: allResults.slice(0, Math.min(limit, MAX_TOTAL_RESULTS)),
    total: Math.min(allResults.length, MAX_TOTAL_RESULTS),
  };
}

// ---------------------------------------------------------------------------
// Per-entity search functions
// ---------------------------------------------------------------------------

async function searchTransactions(
  db: D1Database,
  organizationId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const rows = await queryAll<{
    id: string; transaction_number: string; transaction_type: string;
    description: string; amount_minor: number; transaction_date: string;
  }>(
    db,
    `SELECT id, transaction_number, transaction_type, description,
            amount_minor, transaction_date
     FROM transactions
     WHERE organization_id = ?
       AND status = 'posted'
       AND (LOWER(transaction_number) LIKE ?
            OR LOWER(description) LIKE ?
            OR CAST(amount_minor AS TEXT) LIKE ?)
     ORDER BY
       CASE
         WHEN LOWER(transaction_number) LIKE ? THEN 0
         WHEN LOWER(description) LIKE ? THEN 1
         ELSE 2
       END,
       created_at DESC
     LIMIT ?`,
    [organizationId, pattern, pattern, pattern, pattern, pattern, limit],
  );

  const typeLabels: Record<string, string> = {
    cash_sale: "Penjualan Tunai", credit_sale: "Penjualan Kredit",
    receive_receivable: "Penerimaan Piutang",
    cash_purchase: "Pembelian Tunai", credit_purchase: "Pembelian Kredit",
    pay_payable: "Pembayaran Utang", expense_payment: "Pembayaran Beban",
    owner_capital: "Setoran Modal", owner_draw: "Prive Pemilik",
    cash_transfer: "Transfer Kas",
  };

  return rows.map((r, i) => ({
    entityType: "transaction" as const,
    entityId: r.id,
    label: r.transaction_number,
    subtitle: `${typeLabels[r.transaction_type] ?? r.transaction_type} — Rp ${(r.amount_minor / 100).toLocaleString("id-ID")} — ${r.description}`,
    url: `/transactions/${r.id}`,
    score: limit - i,
  }));
}

async function searchInvoices(
  db: D1Database,
  organizationId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const rows = await queryAll<{
    id: string; invoice_number: string; status: string;
    total_minor: number; party_id: string;
  }>(
    db,
    `SELECT i.id, i.invoice_number, i.status, i.total_minor, i.party_id
     FROM invoices i
     LEFT JOIN parties p ON p.id = i.party_id AND p.organization_id = i.organization_id
     WHERE i.organization_id = ?
       AND (LOWER(i.invoice_number) LIKE ?
            OR LOWER(p.name) LIKE ?)
     ORDER BY
       CASE WHEN LOWER(i.invoice_number) LIKE ? THEN 0 ELSE 1 END,
       i.created_at DESC
     LIMIT ?`,
    [organizationId, pattern, pattern, pattern, limit],
  );

  return rows.map((r, i) => ({
    entityType: "invoice" as const,
    entityId: r.id,
    label: r.invoice_number,
    subtitle: `${r.status} — Rp ${(r.total_minor / 100).toLocaleString("id-ID")}`,
    url: `/invoices/${r.id}`,
    score: limit - i,
  }));
}

async function searchParties(
  db: D1Database,
  organizationId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const rows = await queryAll<{
    id: string; name: string; party_type: string; email: string | null; phone: string | null;
  }>(
    db,
    `SELECT id, name, party_type, email, phone
     FROM parties
     WHERE organization_id = ?
       AND is_active = 1
       AND (LOWER(name) LIKE ?
            OR LOWER(email) LIKE ?
            OR LOWER(phone) LIKE ?)
     ORDER BY
       CASE
         WHEN LOWER(name) LIKE ? THEN 0
         WHEN LOWER(email) LIKE ? THEN 1
         ELSE 2
       END,
       name ASC
     LIMIT ?`,
    [organizationId, pattern, pattern, pattern, pattern, pattern, limit],
  );

  return rows.map((r, i) => ({
    entityType: "party" as const,
    entityId: r.id,
    label: r.name,
    subtitle: (r.party_type === "customer" ? "Pelanggan" : r.party_type === "supplier" ? "Pemasok" : r.party_type) + (r.email ? " — " + r.email : ""), // NOSONAR typescript:S3358
    url: `/transactions?partyId=${r.id}`,
    score: limit - i,
  }));
}

async function searchProducts(
  db: D1Database,
  organizationId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const rows = await queryAll<{
    id: string; code: string; name: string; unit: string;
    current_stock_milli: number;
  }>(
    db,
    `SELECT id, code, name, unit, current_stock_milli
     FROM products
     WHERE organization_id = ?
       AND is_active = 1
       AND (LOWER(code) LIKE ? OR LOWER(name) LIKE ?)
     ORDER BY
       CASE WHEN LOWER(code) LIKE ? THEN 0 ELSE 1 END,
       name ASC
     LIMIT ?`,
    [organizationId, pattern, pattern, pattern, limit],
  );

  return rows.map((r, i) => ({
    entityType: "product" as const,
    entityId: r.id,
    label: `${r.code} — ${r.name}`,
    subtitle: `${r.unit} — Stok: ${(r.current_stock_milli / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 })}`,
    url: `/products`,
    score: limit - i,
  }));
}

async function searchAccounts(
  db: D1Database,
  organizationId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const rows = await queryAll<{
    id: string; code: string; name: string; account_type: string;
  }>(
    db,
    `SELECT id, code, name, account_type
     FROM accounts
     WHERE organization_id = ?
       AND is_active = 1
       AND (LOWER(code) LIKE ? OR LOWER(name) LIKE ?)
     ORDER BY
       CASE WHEN LOWER(code) LIKE ? THEN 0 ELSE 1 END,
       code ASC
     LIMIT ?`,
    [organizationId, pattern, pattern, pattern, limit],
  );

  const typeLabels: Record<string, string> = {
    asset: "Aset", liability: "Kewajiban", equity: "Ekuitas",
    revenue: "Pendapatan", expense: "Beban", cogs: "HPP",
  };

  return rows.map((r, i) => ({
    entityType: "account" as const,
    entityId: r.id,
    label: `${r.code} — ${r.name}`,
    subtitle: typeLabels[r.account_type] ?? r.account_type,
    url: `/accounts`,
    score: limit - i,
  }));
}

async function searchMembers(
  db: D1Database,
  organizationId: string,
  pattern: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const rows = await queryAll<{
    user_id: string; full_name: string; email: string; role: string;
  }>(
    db,
    `SELECT om.user_id, u.full_name, u.email, om.role
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = ?
       AND (LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ?)
     ORDER BY
       CASE WHEN LOWER(u.full_name) LIKE ? THEN 0 ELSE 1 END,
       u.full_name ASC
     LIMIT ?`,
    [organizationId, pattern, pattern, pattern, limit],
  );

  return rows.map((r, i) => ({
    entityType: "member" as const,
    entityId: r.user_id,
    label: r.full_name,
    subtitle: `${r.email} — ${r.role}`,
    url: `/settings/team`,
    score: limit - i,
  }));
}
