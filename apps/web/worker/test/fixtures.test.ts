import { describe, it, expect } from "vitest";
import { createSeedFixtures, FIXTURE_IDS, INVALID_DATA } from "./fixtures";

describe("Seed Fixtures", () => {
  it("creates three organizations with different IDs", () => {
    const ids = [FIXTURE_IDS.orgs.a, FIXTURE_IDS.orgs.b, FIXTURE_IDS.orgs.empty];
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });

  it("createSeedFixtures returns db and session tokens", () => {
    const result = createSeedFixtures();
    expect(result.db).not.toBeNull();
    expect(result.sessionTokenA).toBeTypeOf("string");
    expect(result.sessionTokenA.length).toBeGreaterThan(0);
    expect(result.sessionTokenB).toBeTypeOf("string");
    expect(result.sessionTokenB.length).toBeGreaterThan(0);
    expect(result.sessionTokenB).not.toBe(result.sessionTokenA);
  });

  it("returns tokens for all roles", () => {
    const { tokens } = createSeedFixtures();
    const tokenValues = Object.values(tokens);
    expect(tokenValues).toHaveLength(9);
    const unique = new Set(tokenValues);
    expect(unique.size).toBe(9);
    for (const t of tokenValues) {
      expect(t).toBeTypeOf("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("empty org has owner but no accounts/products/parties", () => {
    expect(FIXTURE_IDS.users.ownerEmpty).toBeTypeOf("string");
    expect(FIXTURE_IDS.users.ownerEmpty.length).toBeGreaterThan(0);
    expect(FIXTURE_IDS.orgs.empty).toBeTypeOf("string");
    expect(FIXTURE_IDS.orgs.empty.length).toBeGreaterThan(0);
    // Empty org has no accounts defined in FIXTURE_IDS.accounts
    const acctKeys = Object.keys(FIXTURE_IDS.accounts);
    const emptyAccounts = acctKeys.filter((k) => k.includes("Empty") || k.includes("empty"));
    expect(emptyAccounts).toHaveLength(0);
  });

  it("has all roles across orgs (owner, admin, member, viewer)", () => {
    const roleUsers: string[] = [
      FIXTURE_IDS.users.ownerA,
      FIXTURE_IDS.users.adminA,
      FIXTURE_IDS.users.memberA,
      FIXTURE_IDS.users.viewerA,
      FIXTURE_IDS.users.ownerB,
      FIXTURE_IDS.users.adminB,
      FIXTURE_IDS.users.memberB,
      FIXTURE_IDS.users.viewerB,
      FIXTURE_IDS.users.ownerEmpty,
    ];
    expect(roleUsers).toHaveLength(9);
    for (const id of roleUsers) {
      expect(id).toBeTypeOf("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("provides cash, AR, AP, inventory, equity, revenue, expense, COGS accounts", () => {
    const accts = FIXTURE_IDS.accounts;
    const required = ["cashA", "arA", "apA", "inventoryA", "equityA", "revenueA", "expenseA", "cogsA"];
    for (const key of required) {
      expect(accts[key as keyof typeof accts]).toBeTypeOf("string");
    }
  });

  it("provides products with stock", () => {
    expect(FIXTURE_IDS.products.widget).toBeTypeOf("string");
    expect(FIXTURE_IDS.products.gadget).toBeTypeOf("string");
  });

  it("provides parties (customer and supplier)", () => {
    expect(FIXTURE_IDS.parties.customerA).toBeTypeOf("string");
    expect(FIXTURE_IDS.parties.supplierA).toBeTypeOf("string");
  });

  it("all fixture IDs are unique across categories", () => {
    const allIds = Object.values(FIXTURE_IDS).flatMap((cat) =>
      Object.values(cat as Record<string, string>),
    );
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("INVALID_DATA provides unbalanced journal fixture", () => {
    const { unbalancedJournal } = INVALID_DATA;
    const totalDebit = unbalancedJournal.lines.reduce((s, l) => s + l.debit_minor, 0);
    const totalCredit = unbalancedJournal.lines.reduce((s, l) => s + l.credit_minor, 0);
    expect(totalDebit).not.toBe(totalCredit);
  });

  it("INVALID_DATA provides negative amount fixture", () => {
    expect(INVALID_DATA.negativeAmount.amount_minor).toBeLessThan(0);
  });

  it("INVALID_DATA provides empty fields fixture", () => {
    expect(INVALID_DATA.emptyFields.name).toBe("");
    expect(INVALID_DATA.emptyFields.code).toBe("");
  });

  it("INVALID_DATA provides empty required fields", () => {
    const txn = INVALID_DATA.missingRequired.transaction;
    expect(txn.transaction_date).toBe("");
    expect(txn.transaction_type).toBe("");
    expect(txn.amount_minor).toBe(0);
  });
});
