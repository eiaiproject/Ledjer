import { describe, it, expect } from "vitest";
import { FakeD1Database } from "../test/fake-d1";

describe("Period Locks Service", () => {
  describe("createPeriodLock", () => {
    it("creates a period lock and returns lock info", async () => {
      const { createPeriodLock } = await import("./period-locks.service");

      const db = new FakeD1Database({
        first: () => null, // No existing lock
        all: () => [],
        run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
      }) as unknown as D1Database;

      const lock = await createPeriodLock(db, "org-1", "user-1", {
        lockedThroughDate: "2026-06-30",
        reason: "Tutup buku Juni",
      });

      expect(lock.organizationId).toBe("org-1");
      expect(lock.lockedThroughDate).toBe("2026-06-30");
      expect(lock.reason).toBe("Tutup buku Juni");
      expect(lock.lockedBy).toBe("user-1");
      expect(lock.id).toBeTypeOf("string");
      expect(lock.id.length).toBeGreaterThan(0);
    });

    it("throws conflict when overlapping lock exists", async () => {
      const { createPeriodLock } = await import("./period-locks.service");

      const db = new FakeD1Database({
        first: () => ({ id: "existing-lock", locked_through_date: "2026-07-31" }),
        all: () => [],
      }) as unknown as D1Database;

      await expect(
        createPeriodLock(db, "org-1", "user-1", {
          lockedThroughDate: "2026-06-15",
          reason: "Duplicate",
        }),
      ).rejects.toMatchObject({ code: "period_lock_overlaps", status: 409 });
    });
  });

  describe("listPeriodLocks", () => {
    it("returns period locks ordered by date descending", async () => {
      const { listPeriodLocks } = await import("./period-locks.service");

      const db = new FakeD1Database({
        all: () => [
          { id: "lock-2", organization_id: "org-1", locked_through_date: "2026-07-31", reason: "July close", locked_by: "user-1", created_at: 2000 },
          { id: "lock-1", organization_id: "org-1", locked_through_date: "2026-06-30", reason: "June close", locked_by: "user-1", created_at: 1000 },
        ],
      }) as unknown as D1Database;

      const locks = await listPeriodLocks(db, "org-1");
      expect(locks).toHaveLength(2);
      expect(locks[0].lockedThroughDate).toBe("2026-07-31");
      expect(locks[1].lockedThroughDate).toBe("2026-06-30");
    });

    it("returns empty array when no locks exist", async () => {
      const { listPeriodLocks } = await import("./period-locks.service");

      const db = new FakeD1Database({
        all: () => [],
      }) as unknown as D1Database;

      const locks = await listPeriodLocks(db, "org-empty");
      expect(locks).toEqual([]);
    });
  });

  describe("deletePeriodLock", () => {
    it("throws notFound when lock does not exist", async () => {
      const { deletePeriodLock } = await import("./period-locks.service");

      const db = new FakeD1Database({
        first: () => null,
      }) as unknown as D1Database;

      await expect(
        deletePeriodLock(db, "org-1", "non-existent-lock", "user-1", "Reopen"),
      ).rejects.toMatchObject({ code: "period_lock_not_found", status: 404 });
    });

    it("deletes existing lock and creates audit entry", async () => {
      const { deletePeriodLock } = await import("./period-locks.service");

      // The first query finds the lock by id+org
      // The second query looks for remaining locks (returns null = none)
      let firstCall = true;
      const db = new FakeD1Database({
        first: () => {
          if (firstCall) {
            firstCall = false;
            return { id: "lock-1", locked_through_date: "2026-06-30" };
          }
          return null; // No remaining lock after deletion
        },
        run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
        batch: () => {
          return [{ success: true, meta: { changes: 1 } } as D1Result];
        },
      }) as unknown as D1Database;

      await expect(
        deletePeriodLock(db, "org-1", "lock-1", "user-1", "Reopen periode"),
      ).resolves.toBeUndefined();
    });
  });
});
