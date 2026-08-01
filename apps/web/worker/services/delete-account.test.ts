import { describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password";
import { deleteAccount } from "./auth.service";
import { FakeD1Database } from "../test/fake-d1";

const USER_ID = "user-1";
const EMAIL = "owner@example.com";
const ORG_SOLO = "org-solo";
const ORG_SHARED = "org-shared";

interface FixtureOptions {
  hasOAuth?: boolean;
  ownerCounts?: Record<string, number>;
  password?: string;
}

function makeDb({ hasOAuth = false, ownerCounts = { [ORG_SOLO]: 1, [ORG_SHARED]: 2 }, password }: FixtureOptions = {}) {
  const captured: { sql: string; values: unknown[] }[] = [];
  const db = new FakeD1Database({
    first: (sql, values) => {
      if (sql.includes("FROM users WHERE id")) {
        return { id: USER_ID, email: EMAIL, password_hash: password ? password : null };
      }
      if (sql.includes("FROM oauth_accounts")) {
        return hasOAuth ? { id: "oa-1" } : null;
      }
      if (sql.includes("COUNT(*) AS c FROM organization_members")) {
        return { c: ownerCounts[String(values[0])] ?? 1 };
      }
      return null;
    },
    all: (sql) => {
      if (sql.includes("organization_members WHERE user_id")) {
        return [{ organization_id: ORG_SOLO }, { organization_id: ORG_SHARED }];
      }
      return [];
    },
    batch: (statements) => {
      captured.push(...statements);
      return statements.map(() => ({ success: true } as D1Result));
    },
  });
  return { db: db as unknown as D1Database, raw: db, captured };
}

describe("deleteAccount", () => {
  it("rejects non-owner with account_delete_not_owner", async () => {
    const db = new FakeD1Database({
      first: (sql) =>
        sql.includes("FROM users WHERE id")
          ? { id: USER_ID, email: EMAIL, password_hash: null }
          : null,
      all: () => [],
    }) as unknown as D1Database;
    await expect(deleteAccount(db, USER_ID, {})).rejects.toMatchObject({
      status: 403,
      code: "account_delete_not_owner",
    });
  });

  it("rejects password user with wrong password", async () => {
    const { db } = makeDb({ password: await hashPassword("Benar123") });
    await expect(deleteAccount(db, USER_ID, { password: "Salah123" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects oauth user without HAPUS confirmation", async () => {
    const { db } = makeDb({ hasOAuth: true });
    await expect(deleteAccount(db, USER_ID, { password: "whatever" })).rejects.toMatchObject({
      status: 400,
      code: "confirmation_required",
    });
  });

  it("deletes user and solo-owned org, keeps shared org (password user)", async () => {
    const { db, captured } = makeDb({ password: await hashPassword("Benar123") });
    const result = await deleteAccount(db, USER_ID, { password: "Benar123" });

    expect(result.deletedOrganizations).toEqual([ORG_SOLO]);
    const sqls = captured.map((s) => s.sql);
    expect(captured.some((s) => s.sql.includes("DELETE FROM organizations") && s.values.includes(ORG_SOLO))).toBe(true);
    expect(captured.some((s) => s.sql.includes("DELETE FROM organizations") && s.values.includes(ORG_SHARED))).toBe(false);
    expect(sqls.some((s) => s.includes("DELETE FROM users WHERE id"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM login_attempts"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM audit_logs WHERE actor_user_id"))).toBe(true);
  });

  it("deletes account for oauth user with HAPUS confirmation", async () => {
    const { db, captured } = makeDb({ hasOAuth: true });
    const result = await deleteAccount(db, USER_ID, { confirmation: "HAPUS" });
    expect(result.deletedOrganizations).toEqual([ORG_SOLO]);
    expect(captured.some((s) => s.sql.includes("DELETE FROM users WHERE id"))).toBe(true);
  });

  it("writes audit trail with NULL actor before deletion", async () => {
    const { db, raw } = makeDb({ hasOAuth: true });
    await deleteAccount(db, USER_ID, { confirmation: "HAPUS" });
    const insert = raw.statements.find(
      (s) => s.sql.includes("INSERT INTO audit_logs") && s.sql.includes("account_deleted"),
    );
    expect(insert).toBeDefined();
    expect(insert!.values).toContain(EMAIL);
    expect(insert!.sql).toContain("NULL, NULL"); // organization_id + actor_user_id NULL
  });
});
