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
});
