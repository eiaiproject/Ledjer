import { describe, it, expect } from "vitest";
import { createBackup, validateBackup } from "./backup.service";
import { CORE_TABLES } from "../db/schema";

class FakeR2Bucket {
  private store = new Map<string, { body: string; metadata?: Record<string, string> }>();

  async put(key: string, data: string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    this.store.set(key, { body: data, metadata: options?.customMetadata ?? {} });
  }

  async get(key: string): Promise<{ text(): Promise<string> } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { text: async () => entry.body };
  }

  async list(opts?: { prefix?: string }): Promise<{ objects: { key: string }[] }> {
    const prefix = opts?.prefix ?? "";
    const objects = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .map((key) => ({ key }));
    return { objects };
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }
}

function makeFakeD1(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 0 } } as D1Result),
      }),
    }),
    batch: async () => [],
  } as unknown as D1Database;
}

/** FakeD1-based helper that returns { count: 0 } for any table query. */
function makeSchemaOnlyDb(): Promise<D1Database> {
  return import("../test/fake-d1").then(({ FakeD1Database }) => {
    const allTables = [...CORE_TABLES, "users", "sessions", "audit_logs", "period_locks",
      "invoices", "invoice_lines", "payments", "invoice_payment_allocations",
      "receivables", "payables", "aging_snapshots", "attachments",
      "reconciliation_statements", "reconciliation_matches", "document_counters",
      "transaction_lines", "stock_movements",
    ];
    return new FakeD1Database({
      first: async (sql: string) => {
        if (sql.includes("LEFT JOIN")) return null;
        for (const t of allTables) {
          if (sql.includes(`FROM "${t}"`) || sql.includes(`FROM ${t}`)) return { count: 0 };
        }
        return null;
      },
    }) as unknown as D1Database;
  });
}

describe("Backup Service", () => {
  it("creates backup with manifest and table files", async () => {
    const bucket = new FakeR2Bucket();
    const db = makeFakeD1();

    const manifest = await createBackup(db, bucket as unknown as R2Bucket);

    expect(manifest.version).toBe(1);
    expect(manifest.startedAt).toBeGreaterThan(0);
    expect(manifest.completedAt).toBeGreaterThan(0);
    expect(manifest.sha256).toBeTruthy();

    for (const table of CORE_TABLES) {
      expect(manifest.tables[table]).toBeDefined();
      expect(manifest.tables[table].rowCount).toBe(0);
    }
  });

  it("backup manifest has valid row counts", async () => {
    const bucket = new FakeR2Bucket();
    const db = makeFakeD1();

    const manifest = await createBackup(db, bucket as unknown as R2Bucket);

    for (const [, info] of Object.entries(manifest.tables)) {
      expect(Number.isInteger(info.rowCount)).toBe(true);
      expect(info.rowCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("validateBackup finds manifest", async () => {
    const bucket = new FakeR2Bucket();
    const db = makeFakeD1();
    const current = Date.now();
    const dateStr = new Date(current).toISOString().slice(0, 10);

    await createBackup(db, bucket as unknown as R2Bucket, current);

    const result = await validateBackup(bucket as unknown as R2Bucket, dateStr);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validateBackup reports missing backup", async () => {
    const bucket = new FakeR2Bucket();
    const result = await validateBackup(bucket as unknown as R2Bucket, "2099-01-01");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("manifest not found");
  });

  it("restoreBackup restores tables from backup snapshot", async () => {
    const { restoreBackup } = await import("./backup.service");
    const { FakeD1Database } = await import("../test/fake-d1");
    const bucket = new FakeR2Bucket();

    const dateStr = "2026-06-15";
    await bucket.put(
      `backups/${dateStr}/organizations.json`,
      JSON.stringify([{ id: "org-1", name: "Org 1", business_type: "simple_trading", base_currency: "IDR", books_start_date: "2026-01-01", onboarding_status: "completed", created_by: "user-1", created_at: Date.now(), updated_at: Date.now() }]),
    );
    await bucket.put(
      `backups/${dateStr}/users.json`,
      JSON.stringify([{ id: "user-1", email: "test@test.com", password_hash: "", full_name: "Test", status: "active", email_verified_at: Date.now(), created_at: Date.now(), updated_at: Date.now() }]),
    );
    const manifest = {
      startedAt: 1, completedAt: 2, version: 1,
      tables: { organizations: { rowCount: 1 }, users: { rowCount: 1 } },
      sha256: "",
    };
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(manifest)));
    manifest.sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    await bucket.put(`backups/${dateStr}/manifest.json`, JSON.stringify(manifest, null, 2));

    const db = new FakeD1Database({
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
      all: async () => [],
    });

    const result = await restoreBackup(db as unknown as D1Database, bucket as unknown as R2Bucket, dateStr);

    expect(result.success).toBe(true);
    expect(result.tables.organizations.restored).toBe(1);
    expect(result.tables.users.restored).toBe(1);
    expect(result.completedAt).toBeGreaterThanOrEqual(result.startedAt);
  });

  it("restoreBackup returns error for invalid backup", async () => {
    const { restoreBackup } = await import("./backup.service");
    const { FakeD1Database } = await import("../test/fake-d1");
    const bucket = new FakeR2Bucket();
    const db = new FakeD1Database({});

    const result = await restoreBackup(db as unknown as D1Database, bucket as unknown as R2Bucket, "2099-01-01");

    expect(result.success).toBe(false);
    expect(result.errors).toContain("manifest not found");
  });

  it("restoreBackup warns if target DB has data", async () => {
    const { restoreBackup } = await import("./backup.service");
    const bucket = new FakeR2Bucket();

    // Pre-populate backup with valid data
    const dateStr = "2026-07-01";
    await bucket.put(`backups/${dateStr}/organizations.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/users.json`, JSON.stringify([]));
    const manifest = {
      startedAt: 1, completedAt: 2, version: 1,
      tables: { organizations: { rowCount: 0 }, users: { rowCount: 0 } },
      sha256: "",
    };
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(manifest)));
    manifest.sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    await bucket.put(`backups/${dateStr}/manifest.json`, JSON.stringify(manifest, null, 2));

    // FakeD1 that reports existing data
    const db = new (await import("../test/fake-d1")).FakeD1Database({
      first: async (sql: string) => {
        if (sql.includes("COUNT(*)") && sql.includes("organizations")) return { count: 3 };
        return null;
      },
    });

    const result = await restoreBackup(db as unknown as D1Database, bucket as unknown as R2Bucket, dateStr);

    // Restore still succeeds but warns about existing data
    expect(result.success).toBe(true);
    expect(result.warnings.some((w: string) => w.includes("target database has"))).toBe(true);
  });

  it("verifyRestore validates restored data integrity", async () => {
    const { verifyRestore } = await import("./backup.service");
    const { FakeD1Database } = await import("../test/fake-d1");

    const db = new FakeD1Database({
      first: async (sql: string) => {
        const s = sql.replace(/\s+/g, " ");
        // Order matters: specific JOIN queries before simple COUNT queries
        if (s.includes("LEFT JOIN") && s.includes("WHERE je.id IS NULL")) return { count: 0 };
        // Simple COUNT queries (no JOIN)
        if (!s.includes("LEFT JOIN")) {
          if (s.includes("COUNT(*)") && s.includes("FROM organizations")) return { count: 2 };
          if (s.includes("COUNT(*)") && s.includes("FROM transactions")) return { count: 5 };
          if (s.includes("COUNT(*)") && s.includes("FROM journal_lines")) return { count: 12 };
          // Schema check: queries with quoted table names
          for (const t of CORE_TABLES) {
            if (s.includes(`FROM "${t}"`)) return { count: 0 };
          }
        }
        if (s.includes("SUM(debit_minor)")) return { total_debit: 100000, total_credit: 100000 };
        return null;
      },
      all: async (sql: string) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("GROUP BY o.id")) {
          return [{ org_id: "org-1", member_count: 3 }, { org_id: "org-2", member_count: 1 }];
        }
        return [];
      },
    });

    const result = await verifyRestore(db as unknown as D1Database);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.organizationCount).toBe(2);
    expect(result.transactionCount).toBe(5);
    expect(result.journalLineCount).toBe(12);
    expect(result.balancedJournals).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("verifyRestore detects unbalanced journals", async () => {
    const { verifyRestore } = await import("./backup.service");
    const { FakeD1Database } = await import("../test/fake-d1");

    const db = new FakeD1Database({
      first: async (sql: string) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("SUM(debit_minor)")) return { total_debit: 100, total_credit: 50 };
        if (s.includes("LEFT JOIN") && s.includes("WHERE je.id IS NULL")) return { count: 0 };
        if (!s.includes("LEFT JOIN")) {
          if (s.includes("COUNT(*)") && s.includes("FROM organizations")) return { count: 1 };
          if (s.includes("COUNT(*)") && s.includes("FROM transactions")) return { count: 1 };
          if (s.includes("COUNT(*)") && s.includes("FROM journal_lines")) return { count: 2 };
          for (const t of CORE_TABLES) {
            if (s.includes(`FROM "${t}"`)) return { count: 0 };
          }
        }
        return null;
      },
      all: async (sql: string) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("GROUP BY o.id")) {
          return [{ org_id: "org-1", member_count: 1 }];
        }
        if (s.includes("HAVING total_debit")) {
          return [{ id: "je-1", total_debit: 100, total_credit: 50 }];
        }
        return [];
      },
    });

    const result = await verifyRestore(db as unknown as D1Database);

    expect(result.valid).toBe(false);
    expect(result.balancedJournals).toBe(false);
    expect(result.errors.some(e => e.includes("unbalanced") || e.includes("trial balance"))).toBe(true);
  });

  it("verifyRestore schemaValid when core tables exist", async () => {
    const { verifyRestore } = await import("./backup.service");

    const db = await makeSchemaOnlyDb();
    const result = await verifyRestore(db as unknown as D1Database);

    expect(result.schemaValid).toBe(true);
  });

  it("runRestoreDrill reports no backups when bucket is empty", async () => {
    const { runRestoreDrill } = await import("./backup.service");
    const bucket = new FakeR2Bucket();

    const report = await runRestoreDrill(bucket as unknown as R2Bucket);

    expect(report.backupExists).toBe(false);
    expect(report.valid).toBe(false);
    expect(report.errors).toContain("no backups found");
    expect(report.duration).toBeGreaterThanOrEqual(0);
  });

  it("runRestoreDrill validates latest backup integrity", async () => {
    const { runRestoreDrill } = await import("./backup.service");
    const bucket = new FakeR2Bucket();

    // Create a valid backup with transactions + journal entries
    const dateStr = "2026-07-01";
    await bucket.put(`backups/${dateStr}/organizations.json`, JSON.stringify([
      { id: "org-1", name: "Org 1", business_type: "simple_trading", base_currency: "IDR", books_start_date: "2026-01-01", onboarding_status: "completed", created_by: "user-1", created_at: 1750000000000, updated_at: 1750000000000 },
    ]));
    await bucket.put(`backups/${dateStr}/users.json`, JSON.stringify([
      { id: "user-1", email: "test@test.com", full_name: "Test", status: "active" },
    ]));
    await bucket.put(`backups/${dateStr}/transactions.json`, JSON.stringify([
      { id: "txn-1", organization_id: "org-1", transaction_number: "TRX-001", transaction_date: "2026-01-15", transaction_type: "cash_sale", amount_minor: 500000, status: "posted" },
    ]));
    await bucket.put(`backups/${dateStr}/journal_entries.json`, JSON.stringify([
      { id: "je-1", organization_id: "org-1", entry_number: "JE-001", entry_date: "2026-01-15", entry_type: "normal", transaction_id: "txn-1", status: "posted" },
    ]));
    await bucket.put(`backups/${dateStr}/journal_lines.json`, JSON.stringify([
      { id: "jl-1", journal_entry_id: "je-1", account_id: "acct-1", debit_minor: 500000, credit_minor: 0, line_order: 1 },
      { id: "jl-2", journal_entry_id: "je-1", account_id: "acct-2", debit_minor: 0, credit_minor: 500000, line_order: 2 },
    ]));
    await bucket.put(`backups/${dateStr}/accounts.json`, JSON.stringify([
      { id: "acct-1", code: "1110", name: "Kas", account_type: "asset", normal_balance: "debit", is_active: 1 },
      { id: "acct-2", code: "4100", name: "Pendapatan", account_type: "revenue", normal_balance: "credit", is_active: 1 },
    ]));
    await bucket.put(`backups/${dateStr}/products.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/stock_movements.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/period_locks.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/sessions.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/email_verifications.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/password_reset_tokens.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/login_attempts.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/oauth_accounts.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/organization_members.json`, JSON.stringify([
      { id: "mem-1", organization_id: "org-1", user_id: "user-1", role: "owner" },
    ]));
    await bucket.put(`backups/${dateStr}/organization_invitations.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/parties.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/transaction_lines.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/organization_document_counters.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/audit_logs.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/attachments.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/bank_statements.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/bank_statement_lines.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/reconciliation_matches.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/invoices.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/invoice_lines.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/payment_allocations.json`, JSON.stringify([]));

    // Build manifest with all tables
    const allTables = [
      "users", "sessions", "email_verifications", "password_reset_tokens", "login_attempts", "oauth_accounts",
      "organizations", "organization_members", "organization_invitations", "accounts", "parties", "products",
      "transactions", "transaction_lines", "journal_entries", "journal_lines", "stock_movements", "period_locks",
      "organization_document_counters", "audit_logs", "attachments", "bank_statements", "bank_statement_lines",
      "reconciliation_matches", "invoices", "invoice_lines", "payment_allocations",
    ];
    const tableCounts: Record<string, { rowCount: number }> = {};
    for (const t of allTables) {
      const obj = await bucket.get(`backups/${dateStr}/${t}.json`);
      if (obj) {
        const rows = JSON.parse(await obj.text());
        tableCounts[t] = { rowCount: rows.length };
      }
    }
    const manifest = {
      startedAt: 1, completedAt: 2, version: 1,
      tables: tableCounts,
      sha256: "",
    };
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(manifest)));
    manifest.sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    await bucket.put(`backups/${dateStr}/manifest.json`, JSON.stringify(manifest, null, 2));

    const report = await runRestoreDrill(bucket as unknown as R2Bucket);

    expect(report.date).toBe(dateStr);
    expect(report.backupExists).toBe(true);
    expect(report.backupComplete).toBe(true);
    expect(report.backupVersion).toBe(1);
    expect(report.tableCount).toBeGreaterThanOrEqual(5);
    expect(report.totalRows).toBeGreaterThanOrEqual(6);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.checkedAt).toBeGreaterThan(0);
  });

  it("runRestoreDrill detects unbalanced journals in backup data", async () => {
    const { runRestoreDrill } = await import("./backup.service");
    const bucket = new FakeR2Bucket();

    const dateStr = "2026-07-02";
    // Only create manifest and journal_lines with unbalanced data
    await bucket.put(`backups/${dateStr}/transactions.json`, JSON.stringify([
      { id: "txn-1", organization_id: "org-1", transaction_number: "TRX-001", transaction_date: "2026-01-15", transaction_type: "cash_sale", amount_minor: 500000, status: "posted" },
    ]));
    await bucket.put(`backups/${dateStr}/journal_entries.json`, JSON.stringify([
      { id: "je-1", organization_id: "org-1", entry_number: "JE-001", entry_date: "2026-01-15", entry_type: "normal", transaction_id: "txn-1", status: "posted" },
    ]));
    await bucket.put(`backups/${dateStr}/journal_lines.json`, JSON.stringify([
      { id: "jl-1", journal_entry_id: "je-1", account_id: "acct-1", debit_minor: 500000, credit_minor: 0, line_order: 1 },
      { id: "jl-2", journal_entry_id: "je-1", account_id: "acct-2", debit_minor: 0, credit_minor: 300000, line_order: 2 },
    ]));
    await bucket.put(`backups/${dateStr}/organizations.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/users.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/accounts.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/products.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/stock_movements.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/period_locks.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/sessions.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/email_verifications.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/password_reset_tokens.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/login_attempts.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/oauth_accounts.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/organization_members.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/organization_invitations.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/parties.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/transaction_lines.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/organization_document_counters.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/audit_logs.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/attachments.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/bank_statements.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/bank_statement_lines.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/reconciliation_matches.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/invoices.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/invoice_lines.json`, JSON.stringify([]));
    await bucket.put(`backups/${dateStr}/payment_allocations.json`, JSON.stringify([]));

    const allTables = [
      "users", "sessions", "email_verifications", "password_reset_tokens", "login_attempts", "oauth_accounts",
      "organizations", "organization_members", "organization_invitations", "accounts", "parties", "products",
      "transactions", "transaction_lines", "journal_entries", "journal_lines", "stock_movements", "period_locks",
      "organization_document_counters", "audit_logs", "attachments", "bank_statements", "bank_statement_lines",
      "reconciliation_matches", "invoices", "invoice_lines", "payment_allocations",
    ];
    const tableCounts: Record<string, { rowCount: number }> = {};
    for (const t of allTables) {
      const obj = await bucket.get(`backups/${dateStr}/${t}.json`);
      if (obj) {
        const rows = JSON.parse(await obj.text());
        tableCounts[t] = { rowCount: rows.length };
      }
    }
    const manifest = {
      startedAt: 1, completedAt: 2, version: 1,
      tables: tableCounts,
      sha256: "",
    };
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(manifest)));
    manifest.sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    await bucket.put(`backups/${dateStr}/manifest.json`, JSON.stringify(manifest, null, 2));

    const report = await runRestoreDrill(bucket as unknown as R2Bucket);

    expect(report.valid).toBe(false);
    expect(report.errors.some(e => e.includes("unbalanced") || e.includes("trial balance"))).toBe(true);
  });

  it("full cycle: backup seed data → restore → verify", async () => {
    const { restoreBackup, verifyRestore } = await import("./backup.service");
    const { FakeD1Database } = await import("../test/fake-d1");
    const bucket = new FakeR2Bucket();

    // Build a backup of seed fixture data from golden-accounting scenario
    const organizations = [
      { id: "org-a-test-fixture-0001", name: "PT Organisasi A", business_type: "simple_trading", base_currency: "IDR", books_start_date: "2026-01-01", onboarding_status: "completed", created_by: "user-orga-owner-00001", created_at: 1750000000000, updated_at: 1750000000000 },
      { id: "org-b-test-fixture-0001", name: "CV Organisasi B", business_type: "service", base_currency: "IDR", books_start_date: "2026-01-01", onboarding_status: "completed", created_by: "user-orgb-owner-00001", created_at: 1750000000000, updated_at: 1750000000000 },
      { id: "org-empty-test-000001", name: "Empty Organization", business_type: "simple_trading", base_currency: "IDR", books_start_date: "2026-06-01", onboarding_status: "pending", created_by: "user-empty-owner-00001", created_at: 1750000000000, updated_at: 1750000000000 },
    ];
    const users = [
      { id: "user-orga-owner-00001", email: "owner@orga.test", full_name: "Owner A", status: "active" },
      { id: "user-orgb-owner-00001", email: "owner@orgb.test", full_name: "Owner B", status: "active" },
      { id: "user-empty-owner-00001", email: "owner@empty.test", full_name: "Owner Empty", status: "active" },
    ];
    const transactions = [
      { id: "txn-orga-cshsl-0001", organization_id: "org-a-test-fixture-0001", transaction_number: "TRX-202601-000001", transaction_date: "2026-01-15", transaction_type: "cash_sale", amount_minor: 500000, status: "posted", idempotency_key: "idem-cashsale-orga-01", posted_at: 1750000000000, created_by: "user-orga-owner-00001", created_at: 1750000000000, updated_at: 1750000000000 },
      { id: "txn-orga-crdsl-0001", organization_id: "org-a-test-fixture-0001", transaction_number: "TRX-202601-000002", transaction_date: "2026-01-20", transaction_type: "credit_sale", amount_minor: 750000, status: "posted", idempotency_key: "idem-crdsale-orga-01", posted_at: 1750000000000, created_by: "user-orga-owner-00001", created_at: 1750000000000, updated_at: 1750000000000 },
    ];

    const dateStr = "2026-06-30";
    for (const [table, rows] of Object.entries({ organizations, users, transactions })) {
      await bucket.put(`backups/${dateStr}/${table}.json`, JSON.stringify(rows));
    }
    const tableCounts = { organizations: { rowCount: organizations.length }, users: { rowCount: users.length }, transactions: { rowCount: transactions.length } };
    const manifest = {
      startedAt: 1, completedAt: 2, version: 1,
      tables: tableCounts,
      sha256: "",
    };
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(manifest)));
    manifest.sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    await bucket.put(`backups/${dateStr}/manifest.json`, JSON.stringify(manifest, null, 2));

    // Empty target DB — any table query returns { count: 0 }
    const db = new FakeD1Database({
      first: async (sql: string) => {
        // Orphan check query: handle this before table matching
        if (sql.includes("LEFT JOIN") && sql.includes("WHERE je.id IS NULL")) return { count: 0 };
        if (sql.includes("LEFT JOIN")) return null;
        // Schema + count queries: known seed-data counts.
        const counts: Record<string, number> = {
          organizations: 3, transactions: 2,
        };
        // Quoted (schema check): `FROM "table"`
        for (const t of CORE_TABLES) {
          if (sql.includes(`FROM "${t}"`)) return { count: counts[t] ?? 0 };
        }
        // Unquoted (count queries at start of verifyRestore)
        if (sql.includes("FROM organizations")) return { count: 3 };
        if (sql.includes("FROM transactions") && !sql.includes("LEFT JOIN")) return { count: 2 };
        if (sql.includes("FROM journal_lines")) return { count: 0 };
        // SUM queries (trial balance)
        if (sql.includes("SUM(debit_minor)")) return { total_debit: 0, total_credit: 0 };
        return null;
      },
      all: async () => [],
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    });

    const restoreResult = await restoreBackup(
      db as unknown as D1Database,
      bucket as unknown as R2Bucket,
      dateStr,
    );
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.tables.organizations.restored).toBe(organizations.length);
    expect(restoreResult.tables.users.restored).toBe(users.length);
    expect(restoreResult.tables.transactions.restored).toBe(transactions.length);

    const verifyResult = await verifyRestore(db as unknown as D1Database);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.organizationCount).toBe(3);
    expect(verifyResult.transactionCount).toBe(2);
    expect(verifyResult.schemaValid).toBe(true);
  });
});
