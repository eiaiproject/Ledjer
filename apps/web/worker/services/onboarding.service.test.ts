import { describe, it, expect } from "vitest";
import { getOnboardingStatus } from "./onboarding.service";
import { FakeD1Database } from "../test/fake-d1";
import { FIXTURE_IDS } from "../test/fixtures";

describe("Onboarding Service", () => {
  it("all steps incomplete for empty org", async () => {
    const db = new FakeD1Database({
      first: async () => ({ count: 0 }),
      all: async () => [],
    });

    const status = await getOnboardingStatus(db as unknown as D1Database, FIXTURE_IDS.orgs.empty);

    expect(status.completed).toBe(false);
    expect(status.completedCount).toBeLessThan(status.totalSteps);
    // First 3 steps are always complete (org exists = profile/type/date done)
    const incompleteSteps = status.steps.filter((s) => !s.completed).map((s) => s.id);
    expect(incompleteSteps).toContain("opening_balances");
    expect(incompleteSteps).toContain("products");
    expect(incompleteSteps).toContain("parties");
    expect(incompleteSteps).toContain("first_transaction");
    expect(incompleteSteps).toContain("team_member");
  });

  it("all steps complete for seeded org", async () => {
    const db = new FakeD1Database({
      first: async (sql: string) => {
        const s = sql.replace(/\s+/g, " ");
        // opening_balance transactions
        if (s.includes("opening_balance")) return { count: 1 };
        // products
        if (s.includes("FROM products")) return { count: 5 };
        // parties
        if (s.includes("FROM parties")) return { count: 3 };
        // transactions (non-opening_balance)
        if (s.includes("transaction_type != 'opening_balance'")) return { count: 10 };
        // team members
        if (s.includes("FROM organization_members")) return { count: 4 };
        return { count: 0 };
      },
      all: async () => [],
    });

    const status = await getOnboardingStatus(db as unknown as D1Database, FIXTURE_IDS.orgs.a);

    expect(status.completed).toBe(true);
    expect(status.completedCount).toBe(status.totalSteps);
  });
});
