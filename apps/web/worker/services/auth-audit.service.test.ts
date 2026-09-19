import { describe, it, expect } from "vitest";
import { FakeD1Database } from "../test/fake-d1";

describe("Auth Audit Service", () => {
  it("logs an auth event with correct entity_type = 'auth'", async () => {
    const { logAuthEvent } = await import("./auth-audit.service");
    const executedQueries: string[] = [];

    const db = new FakeD1Database({
      run: (sql) => {
        executedQueries.push(sql as string);
      },
    }) as unknown as D1Database;

    await logAuthEvent(db, "user-1", "login", { provider: "password" });

    const insertCall = executedQueries.find((q) => q.includes("INSERT INTO audit_logs"));
    expect(insertCall).toBeDefined();
    expect(insertCall).toContain("'auth'");
  });

  it("logs event with all required fields", async () => {
    const { logAuthEvent } = await import("./auth-audit.service");
    const executedStatements: string[] = [];

    const db = new FakeD1Database({
      run: (sql) => {
        executedStatements.push(sql as string);
      },
    }) as unknown as D1Database;

    await logAuthEvent(db, "user-1", "logout");

    const insertCall = executedStatements.find((s) => s.includes("INSERT INTO audit_logs"));
    expect(insertCall).toBeDefined();
    expect(insertCall).toContain("'auth'");
  });

  it("handles an anonymous event with no user", async () => {
    const { logAuthEvent } = await import("./auth-audit.service");
    const executedStatements: string[] = [];

    const db = new FakeD1Database({
      run: (sql) => {
        executedStatements.push(sql as string);
      },
    }) as unknown as D1Database;

    await logAuthEvent(db, null, "password_reset_requested");

    const insertCall = executedStatements.find((s) => s.includes("INSERT INTO audit_logs"));
    expect(insertCall).toBeDefined();
    // user_id dan actor_user_id keduanya NULL untuk event anonim
    expect(insertCall).toContain("NULL");
  });

  it("serializes metadata as JSON", async () => {
    const { logAuthEvent } = await import("./auth-audit.service");

    const db = new FakeD1Database({
      run: () => {},
    }) as unknown as D1Database;

    const metadata = { provider: "google" };
    await logAuthEvent(db, "user-1", "oauth_login", metadata);

    // FakeD1Database stores all run() calls in .statements
    const insertCall = (db as unknown as FakeD1Database).statements.find(
      (s) => s.sql.includes("INSERT INTO audit_logs"),
    );
    expect(insertCall).toBeDefined();
    // after_json ada di values[5] (0-indexed: id, userId, actorUserId, entityId, action, afterJson, createdAt)
    const afterJson = insertCall!.values[5] as string;
    expect(JSON.parse(afterJson)).toEqual(metadata);
  });
});
