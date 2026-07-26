import { describe, it, expect } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import { listParties } from "./parties.service";

describe("Parties Service", () => {
  describe("listParties", () => {
    it("returns active parties ordered by name", async () => {
      const db = new FakeD1Database({
        all: () => [
          { id: "p1", name: "Beta Corp", party_type: "customer", is_active: 1 },
          { id: "p2", name: "Alpha Inc", party_type: "supplier", is_active: 1 },
        ],
      }) as unknown as D1Database;

      const parties = await listParties(db, "org-1");
      expect(parties).toHaveLength(2);
      expect(parties[0].name).toBe("Beta Corp");
      expect(parties[0].party_type).toBe("customer");
      expect(parties[0].is_active).toBe(true);
      expect(parties[1].name).toBe("Alpha Inc");
    });

    it("returns empty array when no active parties exist", async () => {
      const db = new FakeD1Database({
        all: () => [],
      }) as unknown as D1Database;

      const parties = await listParties(db, "org-empty");
      expect(parties).toEqual([]);
    });

    it("converts is_active from 0/1 to boolean", async () => {
      const db = new FakeD1Database({
        all: () => [
          { id: "p1", name: "Active Customer", party_type: "customer", is_active: 0 },
        ],
      }) as unknown as D1Database;

      const parties = await listParties(db, "org-1");
      expect(parties[0].is_active).toBe(false);
    });
  });
});
