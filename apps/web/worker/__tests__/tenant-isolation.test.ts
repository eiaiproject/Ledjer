import { describe, it, expect, beforeEach } from "vitest";
import { TenantScopedRepository } from "../db/tenant-scoped.repository";

/**
 * Tenant Isolation Test Suite
 *
 * Tests that TenantScopedRepository correctly enforces organization_id
 * scoping. Production services must always scope queries to the current
 * session's organization.
 */

describe("Tenant Isolation", () => {
  describe("TenantScopedRepository", () => {
    let repo: TenantScopedRepository;
    // Minimal mock D1Database that tracks query execution
    const executedQueries: Array<{ sql: string; values: unknown[] }> = [];

    const mockDb = {
      prepare(sql: string) {
        const values: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            values.push(...args);
            return this;
          },
          all: async <T>() => {
            executedQueries.push({ sql, values });
            return { results: [] as T[] };
          },
          first: async <T>() => {
            executedQueries.push({ sql, values });
            return null as T | null;
          },
          run: async (): Promise<D1Result> => {
            executedQueries.push({ sql, values });
            return { success: true, meta: { changes: 1 } } as D1Result;
          },
        };
      },
      batch: async (stmts: D1PreparedStatement[]) => {
        return stmts.map(() => ({ success: true, meta: { changes: 1 } } as D1Result));
      },
    } as unknown as D1Database;

    beforeEach(() => {
      executedQueries.length = 0;
      repo = new TenantScopedRepository(mockDb);
    });

    describe("queryAll", () => {
      it("accepts query with valid organization_id for tenant-scoped table", async () => {
        const results = await repo.queryAll(
          "SELECT * FROM accounts WHERE organization_id = ?",
          ["org-abc-123"],
          { table: "accounts" },
        );
        expect(results).toEqual([]);
      });

      it("throws when organization_id is missing for tenant-scoped table", async () => {
        await expect(
          repo.queryAll(
            "SELECT * FROM accounts",
            [],
            { table: "accounts" },
          ),
        ).rejects.toThrow("requires organization_id");
      });

      it("throws when organization_id is too short for tenant-scoped table", async () => {
        await expect(
          repo.queryAll(
            "SELECT * FROM accounts WHERE organization_id = ?",
            ["short"],
            { table: "accounts" },
          ),
        ).rejects.toThrow("requires organization_id");
      });

      it("allows query without org_id for non-tenant table", async () => {
        const results = await repo.queryAll(
          "SELECT * FROM users WHERE email = ?",
          ["test@example.com"],
          { table: "users" },
        );
        expect(results).toEqual([]);
      });

      it("respects custom orgIndex parameter", async () => {
        const results = await repo.queryAll(
          "SELECT * FROM transactions WHERE status = ? AND organization_id = ?",
          ["posted", "org-xyz-789"],
          { table: "transactions", orgIndex: 1 },
        );
        expect(results).toEqual([]);
      });

      it("throws with wrong orgIndex (missing org_id at specified index)", async () => {
        await expect(
          repo.queryAll(
            "SELECT * FROM transactions WHERE status = ? AND organization_id = ?",
            ["posted", "short"],
            { table: "transactions", orgIndex: 1 },
          ),
        ).rejects.toThrow("requires organization_id");
      });
    });

    describe("queryFirst", () => {
      it("accepts query with valid organization_id", async () => {
        const result = await repo.queryFirst(
          "SELECT * FROM products WHERE organization_id = ? AND id = ?",
          ["org-abc-123", "prod-1"],
          { table: "products" },
        );
        expect(result).toBeNull();
      });

      it("throws without organization_id", async () => {
        await expect(
          repo.queryFirst(
            "SELECT * FROM products WHERE id = ?",
            ["prod-1"],
            { table: "products" },
          ),
        ).rejects.toThrow("requires organization_id");
      });
    });

    describe("execute", () => {
      it("accepts write with valid organization_id", async () => {
        const result = await repo.execute(
          "UPDATE accounts SET name = ? WHERE organization_id = ? AND id = ?",
          ["org-abc-123", "New Name", "acct-1"],
          { table: "accounts" },
        );
        expect(result.meta.changes).toBe(1);
      });

      it("throws write without organization_id", async () => {
        await expect(
          repo.execute(
            "UPDATE accounts SET name = ? WHERE id = ?",
            [], // No org_id at all
            { table: "accounts" },
          ),
        ).rejects.toThrow("requires organization_id");
      });
    });


    describe("batch", () => {
      it("accepts batch with valid organization_id on all statements", async () => {
        const results = await repo.batch([
          {
            sql: "UPDATE accounts SET name = ? WHERE organization_id = ? AND id = ?",
            values: ["org-abc-123", "A", "acct-1"],
            config: { table: "accounts" },
          },
          {
            sql: "UPDATE accounts SET name = ? WHERE organization_id = ? AND id = ?",
            values: ["org-abc-123", "B", "acct-2"],
            config: { table: "accounts" },
          },
        ]);
        expect(results).toHaveLength(2);
      });

      it("throws batch if any statement lacks organization_id", () => {
        expect(() =>
          repo.batch([
            {
              sql: "UPDATE accounts SET name = ? WHERE id = ?",
              values: [], // No org_id at all
              config: { table: "accounts" },
            },
          ]),
        ).toThrow("requires organization_id");
      });
    });
  });
});
