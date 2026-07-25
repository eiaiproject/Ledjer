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

    // Populate backup with fake data
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

  it("verifyRestore validates restored data integrity", async () => {
    const { verifyRestore } = await import("./backup.service");
    const { FakeD1Database } = await import("../test/fake-d1");

    const db = new FakeD1Database({
      first: async (sql: string) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("LEFT JOIN journal_entries") && s.includes("WHERE je.id IS NULL")) return { count: 0 };
        if (s.includes("SUM(debit_minor)")) return { total_debit: 100000, total_credit: 100000 };
        if (s.includes("COUNT(*)") && s.includes("FROM organizations")) return { count: 2 };
        if (s.includes("COUNT(*)") && s.includes("FROM transactions")) return { count: 5 };
        if (s.includes("COUNT(*)") && s.includes("FROM journal_lines")) return { count: 12 };
        if (s.includes("HAVING total_debit")) return null;
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
        if (s.includes("COUNT(*)") && s.includes("FROM organizations")) return { count: 1 };
        if (s.includes("COUNT(*)") && s.includes("FROM transactions")) return { count: 1 };
        if (s.includes("COUNT(*)") && s.includes("FROM journal_lines")) return { count: 2 };
        if (s.includes("LEFT JOIN journal_entries") && s.includes("WHERE je.id IS NULL")) return { count: 0 };
        if (s.includes("HAVING total_debit")) return null;
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
});
