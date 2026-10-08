import { describe, it, expect } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import { pushSyncOp, type SyncOp } from "./sync.service";

const baseOp: SyncOp = {
  op_id: "outbox-1",
  user_id: "user-b",
  device_id: null,
  entity_type: "account",
  entity_id: "e1",
  op_type: "create",
  payload: "{}",
  hlc: "1",
  created_at: 1,
};

describe("pushSyncOp constraint mapping", () => {
  it("maps cross-book UNIQUE conflict to duplicate_op_id instead of throwing", async () => {
    const db = new FakeD1Database({
      first: () => null,
      run: () => {
        throw new Error("UNIQUE constraint failed: sync_ops.user_id, sync_ops.op_id");
      },
    }) as unknown as D1Database;

    const res = await pushSyncOp(db, baseOp);
    expect(res).toEqual({ stored: false, reason: "duplicate_op_id" });
  });

  it("stores normally when no conflict", async () => {
    const db = new FakeD1Database({
      first: () => null,
      run: () => ({ success: true, meta: { changes: 1 } }) as D1Result,
    }) as unknown as D1Database;

    const res = await pushSyncOp(db, baseOp);
    expect(res).toEqual({ stored: true });
  });

  it("rethrows non-constraint errors", async () => {
    const db = new FakeD1Database({
      first: () => null,
      run: () => {
        throw new Error("D1 offline");
      },
    }) as unknown as D1Database;

    await expect(pushSyncOp(db, baseOp)).rejects.toThrow("D1 offline");
  });
});
