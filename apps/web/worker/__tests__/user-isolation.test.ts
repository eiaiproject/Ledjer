import { describe, it, expect, beforeEach } from "vitest";
import { UserScopedRepository } from "../db/user-scoped.repository";

/**
 * User Isolation Test Suite
 *
 * Tests that UserScopedRepository correctly enforces user_id scoping.
 * Ledjer is single-user, so every production query on a user-scoped table
 * must be scoped to the session's user.
 */

describe("User Isolation", () => {
  describe("UserScopedRepository", () => {
    let repo: UserScopedRepository;
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
      repo = new UserScopedRepository(mockDb);
    });

    describe("queryAll", () => {
      it("accepts query with valid user_id for user-scoped table", async () => {
        const results = await repo.queryAll(
          "SELECT * FROM accounts WHERE user_id = ?",
          ["user-abc-123"],
          { table: "accounts" },
        );
        expect(results).toEqual([]);
      });

      it("throws when user_id is missing for user-scoped table", async () => {
        await expect(
          repo.queryAll(
            "SELECT * FROM accounts",
            [],
            { table: "accounts" },
          ),
        ).rejects.toThrow("requires user_id");
      });

      it("throws when user_id is too short for user-scoped table", async () => {
        await expect(
          repo.queryAll(
            "SELECT * FROM accounts WHERE user_id = ?",
            ["short"],
            { table: "accounts" },
          ),
        ).rejects.toThrow("requires user_id");
      });

      it("allows query without user_id for non-user-scoped table", async () => {
        const results = await repo.queryAll(
          "SELECT * FROM users WHERE email = ?",
          ["test@example.com"],
          { table: "users" },
        );
        expect(results).toEqual([]);
      });

      it("respects custom userIndex parameter", async () => {
        const results = await repo.queryAll(
          "SELECT * FROM transactions WHERE status = ? AND user_id = ?",
          ["posted", "user-xyz-789"],
          { table: "transactions", userIndex: 1 },
        );
        expect(results).toEqual([]);
      });

      it("throws with wrong userIndex (missing user_id at specified index)", async () => {
        await expect(
          repo.queryAll(
            "SELECT * FROM transactions WHERE status = ? AND user_id = ?",
            ["posted", "short"],
            { table: "transactions", userIndex: 1 },
          ),
        ).rejects.toThrow("requires user_id");
      });
    });

    describe("queryFirst", () => {
      it("accepts query with valid user_id", async () => {
        const result = await repo.queryFirst(
          "SELECT * FROM transactions WHERE user_id = ? AND id = ?",
          ["user-abc-123", "txn-1"],
          { table: "transactions" },
        );
        expect(result).toBeNull();
      });

      it("throws without user_id", async () => {
        await expect(
          repo.queryFirst(
            "SELECT * FROM transactions WHERE id = ?",
            ["txn-1"],
            { table: "transactions" },
          ),
        ).rejects.toThrow("requires user_id");
      });
    });

    describe("execute", () => {
      it("accepts write with valid user_id", async () => {
        const result = await repo.execute(
          "UPDATE accounts SET name = ? WHERE user_id = ? AND id = ?",
          ["user-abc-123", "New Name", "acct-1"],
          { table: "accounts" },
        );
        expect(result.meta.changes).toBe(1);
      });

      it("throws write without user_id", async () => {
        await expect(
          repo.execute(
            "UPDATE accounts SET name = ? WHERE id = ?",
            [], // No user_id at all
            { table: "accounts" },
          ),
        ).rejects.toThrow("requires user_id");
      });
    });

    describe("batch", () => {
      it("accepts batch with valid user_id on all statements", async () => {
        const results = await repo.batch([
          {
            sql: "UPDATE accounts SET name = ? WHERE user_id = ? AND id = ?",
            values: ["user-abc-123", "A", "acct-1"],
            config: { table: "accounts" },
          },
          {
            sql: "UPDATE accounts SET name = ? WHERE user_id = ? AND id = ?",
            values: ["user-abc-123", "B", "acct-2"],
            config: { table: "accounts" },
          },
        ]);
        expect(results).toHaveLength(2);
      });

      it("throws batch if any statement lacks user_id", () => {
        expect(() =>
          repo.batch([
            {
              sql: "UPDATE accounts SET name = ? WHERE id = ?",
              values: [], // No user_id at all
              config: { table: "accounts" },
            },
          ]),
        ).toThrow("requires user_id");
      });
    });
  });
});
