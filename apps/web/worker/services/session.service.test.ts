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
              email_verified_at: Date.now(),
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
