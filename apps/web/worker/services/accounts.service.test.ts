import { describe, expect, it } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createCashBankAccount,
  listAccounts,
  nextCashBankCode,
  patchAccount,
} from "./accounts.service";
import { HttpError } from "../http/errors";

const ORG_A = FIXTURE_IDS.orgs.a;
const ORG_B = FIXTURE_IDS.orgs.b;
const OWNER_A = FIXTURE_IDS.users.ownerA;

function freshDb(): D1Database {
  return createSeedFixtures().db as unknown as D1Database;
}

describe("listAccounts", () => {
  it("returns active accounts with balances computed from posted journals", async () => {
    const accounts = await listAccounts(freshDb(), ORG_A);
    const cash = accounts.find((a) => a.id === FIXTURE_IDS.accounts.cashA);
    const bank = accounts.find((a) => a.id === FIXTURE_IDS.accounts.bankA);
    // Kas = 5jt + 2jt - 1.2jt - 0.5jt + 0.8jt (Juli) = 6.1jt; Bank = 500rb.
    expect(cash?.balance_idr).toBe(6100000);
    expect(bank?.balance_idr).toBe(500000);
    expect(cash?.account_subtype).toBe("cash");
  });

  it("filters by subtype", async () => {
    const db = freshDb();
    const cash = await listAccounts(db, ORG_A, { subtype: "cash" });
    const bank = await listAccounts(db, ORG_A, { subtype: "bank" });
    expect(cash.every((a) => a.account_subtype === "cash")).toBe(true);
    expect(bank.every((a) => a.account_subtype === "bank")).toBe(true);
  });

  it("isolates organizations", async () => {
    const accounts = await listAccounts(freshDb(), ORG_B);
    expect(accounts.every((a) => a.organization_id === ORG_B)).toBe(true);
    expect(accounts.some((a) => a.id === FIXTURE_IDS.accounts.cashA)).toBe(false);
  });
});

describe("nextCashBankCode", () => {
  it("returns the next code after the highest cash/bank account code", async () => {
    const code = await nextCashBankCode(freshDb(), ORG_A);
    // Org A has 1110 (Kas) and 1120 (Bank) → next = 1130.
    expect(code).toBe("1130");
  });
});

describe("createCashBankAccount", () => {
  it("creates an asset account with the next code and subtype", async () => {
    const db = freshDb();
    const account = await createCashBankAccount(db, ORG_A, OWNER_A, {
      subtype: "bank",
      name: "BCA 123456",
    });
    expect(account.code).toBe("1130");
    expect(account.account_class).toBe("asset");
    expect(account.account_subtype).toBe("bank");
    expect(account.is_system).toBe(0);
    expect(account.is_active).toBe(1);
  });

  it("rejects a duplicate account name within the organization", async () => {
    const db = freshDb();
    await expect(
      createCashBankAccount(db, ORG_A, OWNER_A, { subtype: "cash", name: "Kas" }),
    ).rejects.toThrowError(HttpError);
  });

  it("allows the same name in a different organization", async () => {
    const db = freshDb();
    // "Bank" exists in Org A but not in Org B → creation must succeed there.
    const account = await createCashBankAccount(db, ORG_B, FIXTURE_IDS.users.ownerB, {
      subtype: "bank",
      name: "Bank",
    });
    expect(account.organization_id).toBe(ORG_B);
  });
});

describe("patchAccount", () => {
  it("renames a non-system account", async () => {
    const db = freshDb();
    const account = await createCashBankAccount(db, ORG_A, OWNER_A, {
      subtype: "cash",
      name: "Kas Kecil",
    });
    const updated = await patchAccount(db, ORG_A, account.id, OWNER_A, { name: "Kas Besar" });
    expect(updated.name).toBe("Kas Besar");
  });

  it("deactivates a non-system account that is not in use", async () => {
    const db = freshDb();
    const account = await createCashBankAccount(db, ORG_A, OWNER_A, {
      subtype: "cash",
      name: "Kas Kecil",
    });
    const updated = await patchAccount(db, ORG_A, account.id, OWNER_A, { isActive: false });
    expect(updated.is_active).toBe(0);
  });

  it("rejects deactivating a system account", async () => {
    const db = freshDb();
    await expect(
      patchAccount(db, ORG_A, FIXTURE_IDS.accounts.cashA, OWNER_A, { isActive: false }),
    ).rejects.toThrowError(HttpError);
  });

  it("rejects deactivating an account used by transactions", async () => {
    const db = freshDb();
    await expect(
      patchAccount(db, ORG_A, FIXTURE_IDS.accounts.revenueA, OWNER_A, { isActive: false }),
    ).rejects.toThrowError(HttpError);
  });

  it("throws not found for an account outside the org", async () => {
    const db = freshDb();
    await expect(
      patchAccount(db, ORG_A, FIXTURE_IDS.accounts.cashB, OWNER_A, { name: "X" }),
    ).rejects.toThrowError(HttpError);
  });
});