import { describe, expect, it } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createAccount,
  createCashBankAccount,
  listAccounts,
  nextCashBankCode,
  patchAccount,
} from "./accounts.service";
import { HttpError } from "../http/errors";

const OWNER_A = FIXTURE_IDS.users.ownerA;
const OWNER_B = FIXTURE_IDS.users.ownerB;

function freshDb(): D1Database {
  return createSeedFixtures().db as unknown as D1Database;
}

describe("listAccounts", () => {
  it("returns active accounts with balances computed from posted journals", async () => {
    const accounts = await listAccounts(freshDb(), OWNER_A);
    const cash = accounts.find((a) => a.id === FIXTURE_IDS.accounts.cashA);
    const bank = accounts.find((a) => a.id === FIXTURE_IDS.accounts.bankA);
    // Kas = 5jt + 2jt - 1.2jt - 0.5jt + 0.8jt (Juli) = 6.1jt; Bank = 500rb.
    expect(cash?.balance_idr).toBe(6100000);
    expect(bank?.balance_idr).toBe(500000);
    expect(cash?.account_subtype).toBe("cash");
  });

  it("filters by subtype", async () => {
    const db = freshDb();
    const cash = await listAccounts(db, OWNER_A, { subtype: "cash" });
    const bank = await listAccounts(db, OWNER_A, { subtype: "bank" });
    expect(cash.every((a) => a.account_subtype === "cash")).toBe(true);
    expect(bank.every((a) => a.account_subtype === "bank")).toBe(true);
  });

  it("isolates books", async () => {
    const accounts = await listAccounts(freshDb(), OWNER_B);
    expect(accounts.every((a) => a.user_id === OWNER_B)).toBe(true);
    expect(accounts.some((a) => a.id === FIXTURE_IDS.accounts.cashA)).toBe(false);
  });
});

describe("nextCashBankCode", () => {
  it("returns the next code after the highest cash/bank account code", async () => {
    const code = await nextCashBankCode(freshDb(), OWNER_A);
    // Buku A punya 1110 (Kas) dan 1120 (Bank); 1130 dipakai Persediaan,
    // jadi kode kas/bank bebas berikutnya adalah 1140.
    expect(code).toBe("1140");
  });
});

describe("createCashBankAccount", () => {
  it("creates an asset account with the next code and subtype", async () => {
    const db = freshDb();
    const account = await createCashBankAccount(db, OWNER_A, {
      subtype: "bank",
      name: "BCA 123456",
    });
    expect(account.code).toBe("1140");
    expect(account.account_class).toBe("asset");
    expect(account.account_subtype).toBe("bank");
    expect(account.is_system).toBe(0);
    expect(account.is_active).toBe(1);
  });

  it("rejects a duplicate account name in the same book", async () => {
    const db = freshDb();
    await expect(
      createCashBankAccount(db, OWNER_A, { subtype: "cash", name: "Kas" }),
    ).rejects.toThrowError(HttpError);
  });

  it("allows the same name in a different book", async () => {
    const db = freshDb();
    // "Bank" ada di buku A tapi belum di buku B → pembuatan harus berhasil.
    const account = await createCashBankAccount(db, OWNER_B, {
      subtype: "bank",
      name: "Bank",
    });
    expect(account.user_id).toBe(OWNER_B);
  });
});

describe("patchAccount", () => {
  it("renames a non-system account", async () => {
    const db = freshDb();
    const account = await createCashBankAccount(db, OWNER_A, {
      subtype: "cash",
      name: "Kas Kecil",
    });
    const updated = await patchAccount(db, OWNER_A, account.id, { name: "Kas Besar" });
    expect(updated.name).toBe("Kas Besar");
  });

  it("deactivates a non-system account that is not in use", async () => {
    const db = freshDb();
    const account = await createCashBankAccount(db, OWNER_A, {
      subtype: "cash",
      name: "Kas Kecil",
    });
    const updated = await patchAccount(db, OWNER_A, account.id, { isActive: false });
    expect(updated.is_active).toBe(0);
  });

  it("rejects deactivating a system account", async () => {
    const db = freshDb();
    await expect(
      patchAccount(db, OWNER_A, FIXTURE_IDS.accounts.cashA, { isActive: false }),
    ).rejects.toThrowError(HttpError);
  });

  it("rejects deactivating an account used by transactions", async () => {
    const db = freshDb();
    await expect(
      patchAccount(db, OWNER_A, FIXTURE_IDS.accounts.revenueA, { isActive: false }),
    ).rejects.toThrowError(HttpError);
  });

  it("throws not found for an account outside the book", async () => {
    const db = freshDb();
    await expect(
      patchAccount(db, OWNER_A, FIXTURE_IDS.accounts.cashB, { name: "X" }),
    ).rejects.toThrowError(HttpError);
  });
});
describe("createAccount (non-kas: pendapatan/beban)", () => {
  it("creates an income account with the next 41xx code", async () => {
    const db = freshDb();
    const account = await createAccount(db, OWNER_A, {
      accountClass: "income",
      name: "Pendapatan Jasa",
    });
    expect(account.code).toBe("4130");
    expect(account.account_class).toBe("income");
    expect(account.account_subtype).toBeNull();
    expect(account.is_system).toBe(0);
    expect(account.is_active).toBe(1);
  });

  it("creates an expense account past the system HPP code", async () => {
    const db = freshDb();
    const first = await createAccount(db, OWNER_A, {
      accountClass: "expense",
      name: "Beban Iklan",
    });
    expect(first.code).toBe("6200");
    const second = await createAccount(db, OWNER_A, {
      accountClass: "expense",
      name: "Beban Listrik",
    });
    expect(second.code).toBe("6210");
  });

  it("rejects a duplicate account name in the same book", async () => {
    const db = freshDb();
    await expect(
      createAccount(db, OWNER_A, { accountClass: "expense", name: "Beban Sewa" }),
    ).rejects.toThrowError(HttpError);
  });
});
