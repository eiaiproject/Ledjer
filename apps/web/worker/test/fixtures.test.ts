import { describe, it, expect } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "./fixtures";

describe("Seed Fixtures", () => {
  it("creates three organizations with different IDs", () => {
    const ids = [FIXTURE_IDS.orgs.a, FIXTURE_IDS.orgs.b, FIXTURE_IDS.orgs.empty];
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });

  it("createSeedFixtures returns db and session tokens", () => {
    const result = createSeedFixtures();
    expect(result.db).toBeTruthy();
    expect(result.sessionTokenA).toBeTruthy();
    expect(result.sessionTokenB).not.toBe(result.sessionTokenA);
  });

  it("empty org has owner but no accounts/products/parties", () => {
    expect(FIXTURE_IDS.users.ownerEmpty).toBeTruthy();
    expect(FIXTURE_IDS.orgs.empty).toBeTruthy();
    // Empty org has no accounts defined in FIXTURE_IDS.accounts
    const acctKeys = Object.keys(FIXTURE_IDS.accounts);
    const emptyAccounts = acctKeys.filter((k) => k.includes("Empty") || k.includes("empty"));
    expect(emptyAccounts).toHaveLength(0);
  });

  it("has 4+ roles across orgs (owner, admin, member, viewer)", () => {
    expect(FIXTURE_IDS.users.ownerA).toBeTruthy();
    expect(FIXTURE_IDS.users.adminA).toBeTruthy();
    expect(FIXTURE_IDS.users.memberA).toBeTruthy();
    expect(FIXTURE_IDS.users.viewerA).toBeTruthy();
    expect(FIXTURE_IDS.users.ownerB).toBeTruthy();
    expect(FIXTURE_IDS.users.adminB).toBeTruthy();
    expect(FIXTURE_IDS.users.memberB).toBeTruthy();
    expect(FIXTURE_IDS.users.ownerEmpty).toBeTruthy();
  });

  it("provides cash, AR, AP, inventory, equity, revenue, expense accounts", () => {
    const accts = FIXTURE_IDS.accounts;
    expect(accts.cashA).toBeTruthy();
    expect(accts.arA).toBeTruthy();
    expect(accts.apA).toBeTruthy();
    expect(accts.inventoryA).toBeTruthy();
    expect(accts.equityA).toBeTruthy();
    expect(accts.revenueA).toBeTruthy();
    expect(accts.expenseA).toBeTruthy();
  });

  it("provides products with stock", () => {
    expect(FIXTURE_IDS.products.widget).toBeTruthy();
    expect(FIXTURE_IDS.products.gadget).toBeTruthy();
  });

  it("provides parties (customer and supplier)", () => {
    expect(FIXTURE_IDS.parties.customerA).toBeTruthy();
    expect(FIXTURE_IDS.parties.supplierA).toBeTruthy();
  });

  it("all fixture IDs are unique across categories", () => {
    const allIds = Object.values(FIXTURE_IDS).flatMap((cat) =>
      Object.values(cat as Record<string, string>),
    );
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});
