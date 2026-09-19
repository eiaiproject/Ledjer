import { describe, expect, it } from "vitest";
import { hashToken } from "./auth/tokens";
import type { Env } from "./env";
import { app } from "./index";
import { FakeD1Database } from "./test/fake-d1";

const EXPECTED_BUSINESS_NAME = "Warung Baru";

interface ProfileDb {
  db: D1Database;
  appliedUpdates: string[];
}

/**
 * Minimal D1 stub for the profile endpoints: the session lookup (used by
 * getSessionByToken) plus the users UPDATE that rename writes.
 */
function profileDb(tokenHash: string): ProfileDb {
  const appliedUpdates: string[] = [];
  const db = new FakeD1Database({
    first: (sql, values) => {
      const s = (sql as string).replace(/\s+/g, " ");
      if (s.includes("FROM sessions s") && s.includes("JOIN users u")) {
        // Param order with the rotation-grace feature:
        // [current, idleCutoff, tokenHash, tokenHash, graceCurrent].
        if (tokenHash !== (values[2] as string)) return null;
        return {
          session_id: "session-1",
          user_id: "user-1",
          expires_at: Date.now() + 60_000,
          email: "owner@example.com",
          full_name: "Owner",
          business_name: "Warung Lama",
          last_used_at: Date.now(),
          last_rotated_at: null,
          created_at: Date.now() - 1000,
        };
      }
      return null;
    },
    run: (sql) => {
      const s = (sql as string).replace(/\s+/g, " ");
      if (s.includes("UPDATE users SET business_name")) appliedUpdates.push("business_name");
      return { success: true, meta: { changes: 1 } } as D1Result;
    },
  }) as unknown as D1Database;
  return { db, appliedUpdates };
}

async function testEnv(token: string): Promise<Env> {
  return {
    ASSETS: {
      fetch: () => Promise.resolve(new Response("asset")),
    } as unknown as Fetcher,
    DB: profileDb(await hashToken(token)).db,
    APP_ORIGIN: "http://localhost:5173",
  };
}

describe("Profile API", () => {
  it("returns the signed-in user with their book name", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        headers: { Cookie: `ledjer_session=${token}` },
      }),
      await testEnv(token),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: "user-1",
        email: "owner@example.com",
        business_name: "Warung Lama",
      },
      session: { id: "session-1", user_id: "user-1" },
    });
  });

  it("returns null user for an unauthenticated request", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/auth/me"),
      await testEnv("no-such-token"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: null, session: null });
  });

  it("rejects renaming without a session", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
        },
        body: JSON.stringify({ businessName: EXPECTED_BUSINESS_NAME }),
      }),
      await testEnv("no-such-token"),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a mutating request from a foreign origin (CSRF)", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: {
          Cookie: `ledjer_session=${token}`,
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({ businessName: EXPECTED_BUSINESS_NAME }),
      }),
      await testEnv(token),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "csrf_invalid" },
    });
  });

  it("renames the book", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        method: "PATCH",
        headers: {
          Cookie: `ledjer_session=${token}`,
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
        },
        body: JSON.stringify({ businessName: EXPECTED_BUSINESS_NAME }),
      }),
      await testEnv(token),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      businessName: EXPECTED_BUSINESS_NAME,
    });
  });
});
