import { describe, expect, it } from "vitest";
import { splitParties, type PublicParty } from "./parties";

const party = (id: string, party_type: PublicParty["party_type"]): PublicParty => ({
  id,
  name: id,
  party_type,
  is_active: true,
});

describe("splitParties", () => {
  it("splits a flat party list into customers and suppliers", () => {
    const parties = [party("c1", "customer"), party("s1", "supplier"), party("c2", "customer")];
    const { customers, suppliers } = splitParties(parties);
    expect(customers.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(suppliers.map((p) => p.id)).toEqual(["s1"]);
  });

  it("ignores non customer/supplier party types", () => {
    const parties = [party("e1", "employee"), party("o1", "owner"), party("x1", "other")];
    const { customers, suppliers } = splitParties(parties);
    expect(customers).toEqual([]);
    expect(suppliers).toEqual([]);
  });

  it("returns empty arrays for an empty list", () => {
    const { customers, suppliers } = splitParties([]);
    expect(customers).toEqual([]);
    expect(suppliers).toEqual([]);
  });
});
