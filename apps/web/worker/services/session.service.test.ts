import { describe, it, expect } from "vitest";
import { FakeD1Database } from "../test/fake-d1";

describe("Session Service", () => {
  describe("createSession", () => {
    it("creates a session and returns token with expiry", async () => {
      const { createSession } = await import("./session.service");
      const executedQueries: string[] = [];

      const db = new FakeD1Database({
        run: (sql) => {
          executedQueries.push(sql as string);
        },
      }) as unknown as D1Database;

      const request = new Request("http://localhost", {
        headers: {
          "CF-Connecting-IP": "192.168.1.1",
          "User-Agent": "Mozilla/5.0",
        },
      });

      const result = await createSession(db, "user-1", request);
      expect(result.token).toBeTypeOf("string");
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.expiresAt).toBeGreaterThan(Date.now());

      const insertCall = executedQueries.find((q) => q.includes("INSERT INTO sessions"));
      expect(insertCall).toBeDefined();
    });

    it("creates unique tokens for different sessions", async () => {
      const { createSession } = await import("./session.service");
      const db = new FakeD1Database() as unknown as D1Database;
      const request = new Request("http://localhost");

      const s1 = await createSession(db, "user-1", request);
      const s2 = await createSession(db, "user-1", request);
      expect(s1.token).not.toBe(s2.token);
    });

    it("expires sessions 14 days after login (absolute TTL)", async () => {
      const { createSession } = await import("./session.service");
      const db = new FakeD1Database() as unknown as D1Database;
      const request = new Request("http://localhost");

      const before = Date.now();
      const result = await createSession(db, "user-1", request);
      const after = Date.now();

      const fourteenDays = 14 * 24 * 60 * 60 * 1000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + fourteenDays);
      expect(result.expiresAt).toBeLessThanOrEqual(after + fourteenDays);
    });
  });

  describe("getSessionByToken", () => {
    it("returns null for invalid token", async () => {
      const { getSessionByToken } = await import("./session.service");
      const db = new FakeD1Database({
        first: () => null,
      }) as unknown as D1Database;

      const session = await getSessionByToken(db, "invalid-token");
      expect(session).toBeNull();
    });

    it("returns session data for valid token", async () => {
      const { getSessionByToken } = await import("./session.service");

      // Actually we need a real FakeD1Database flow. Simpler: test getSessionByToken with mocked first.
      const db2 = new FakeD1Database({
        first: (sql) => {
          if ((sql as string).includes("FROM sessions s")) {
            return {
              session_id: "session-1",
              user_id: "user-1",
              expires_at: Date.now() + 86_400_000,
              current_organization_id: null,
              email: "test@example.com",
              full_name: "Test User",
            };
          }
          return null;
        },
      }) as unknown as D1Database;

      const session = await getSessionByToken(db2, "some-token");
      expect(session).not.toBeNull();
      expect(session!.user_id).toBe("user-1");
      expect(session!.email).toBe("test@example.com");
      expect(session!.full_name).toBe("Test User");
    });

    it("enforces the idle timeout in the session query", async () => {
      const { getSessionByToken, IDLE_TIMEOUT_MS } = await import("./session.service");
      let capturedSql = "";
      let capturedValues: unknown[] = [];

      const db = new FakeD1Database({
        first: (sql, values) => {
          capturedSql = sql as string;
          capturedValues = values;
          // Simulate the DB rejecting the row because last_used_at is stale.
          return null;
        },
      }) as unknown as D1Database;

      const before = Date.now();
      await getSessionByToken(db, "some-token");
      const after = Date.now();

      // Query must filter on last_used_at within the idle window.
      expect(capturedSql).toContain("s.last_used_at >= ?");
      // values = [tokenHash, current, current - IDLE_TIMEOUT_MS]
      const idleBound = capturedValues[2] as number;
      expect(idleBound).toBeGreaterThanOrEqual(before - IDLE_TIMEOUT_MS);
      expect(idleBound).toBeLessThanOrEqual(after - IDLE_TIMEOUT_MS);
    });

    it("returns null when the session row is idle-expired", async () => {
      const { getSessionByToken } = await import("./session.service");
      // DB returns no row (idle bound not satisfied) → must be treated as logged out.
      const db = new FakeD1Database({
        first: () => null,
      }) as unknown as D1Database;

      const session = await getSessionByToken(db, "stale-token");
      expect(session).toBeNull();
    });

    it("rotates the token when it was issued more than 7 days ago", async () => {
      const { getSessionByToken } = await import("./session.service");
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

      const db = new FakeD1Database({
        first: (sql) => {
          if ((sql as string).includes("FROM sessions s")) {
            return {
              session_id: "session-1",
              user_id: "user-1",
              expires_at: now + 86_400_000,
              current_organization_id: null,
              email: "test@example.com",
              full_name: "Test User",
              // Active within the idle window, but the token hash is 8 days old.
              last_used_at: now,
              last_rotated_at: eightDaysAgo,
              created_at: eightDaysAgo,
            };
          }
          return null;
        },
        run: () => ({ success: true, meta: { changes: 1 } } as D1Result),
      }) as unknown as D1Database;

      const session = await getSessionByToken(db, "some-token");
      expect(session).not.toBeNull();
      expect(session!.newToken).toBeTypeOf("string");
    });
  });

  describe("revokeSessionToken", () => {
    it("sets revoked_at on the session", async () => {
      const { revokeSessionToken } = await import("./session.service");
      const executedQueries: string[] = [];

      const db = new FakeD1Database({
        run: (sql) => {
          executedQueries.push(sql as string);
        },
      }) as unknown as D1Database;

      await revokeSessionToken(db, "token-to-revoke");

      const updateCall = executedQueries.find((q) => q.includes("UPDATE sessions"));
      expect(updateCall).toBeDefined();
      expect(updateCall).toContain("revoked_at");
    });
  });

  describe("revokeAllUserSessions", () => {
    it("revokes all sessions for a user", async () => {
      const { revokeAllUserSessions } = await import("./session.service");
      const executedQueries: string[] = [];

      const db = new FakeD1Database({
        run: (sql) => {
          executedQueries.push(sql as string);
        },
      }) as unknown as D1Database;

      await revokeAllUserSessions(db, "user-1");

      const updateCall = executedQueries.find((q) => q.includes("UPDATE sessions"));
      expect(updateCall).toBeDefined();
      expect(updateCall).toContain("user_id = ?");
    });
  });

  describe("setSessionCurrentOrganization", () => {
    it("updates current_organization_id", async () => {
      const { setSessionCurrentOrganization } = await import("./session.service");
      const executedQueries: string[] = [];

      const db = new FakeD1Database({
        run: (sql) => {
          executedQueries.push(sql as string);
        },
      }) as unknown as D1Database;

      await setSessionCurrentOrganization(db, "session-1", "org-1");

      const updateCall = executedQueries.find((q) => q.includes("UPDATE sessions"));
      expect(updateCall).toBeDefined();
      expect(updateCall).toContain("current_organization_id");
    });
  });
});
